import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import pool from '../db/pool';
import { createUser } from '../db/testing/fixtures';
import { resetTestDatabase } from '../db/testing/test-database';
import type { DriveService } from './drive.service';
import { createContent, deleteContent, updateContent } from './content.service';

const PDF_BYTES = Buffer.from('%PDF-1.7\nbody of the document');
const MP4_BYTES = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

let stagingDir: string;
let authorId: string;
let otherFacultyId: string;
let adminId: string;

const fakeDrive = (configured = false): DriveService => ({
  isConfigured: configured,
  uploadFile: vi.fn(async (source: { stream: NodeJS.ReadableStream }) => {
    await new Promise<void>((resolve) => {
      source.stream.on('end', () => resolve());
      source.stream.on('error', () => resolve());
      source.stream.resume();
    });
    return { webViewLink: 'https://drive.google.com/file/d/uploaded/view' };
  }),
});

const writeTemp = async (bytes: Buffer): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'content-src-'));
  const path = join(dir, 'upload.bin');
  await writeFile(path, bytes);
  return path;
};

const auditActions = async (targetId: string): Promise<string[]> => {
  const { rows } = await pool.query<{ action: string }>(
    'SELECT action FROM audit_logs WHERE target_id = $1 ORDER BY created_at',
    [targetId],
  );
  return rows.map((row) => row.action);
};

beforeEach(async () => {
  await resetTestDatabase();
  stagingDir = await mkdtemp(join(tmpdir(), 'content-stage-'));
  authorId = (await createUser(9001, 'faculty')).id;
  otherFacultyId = (await createUser(9002, 'faculty')).id;
  adminId = (await createUser(9003, 'admin')).id;
});

const createStaged = async (overrides: { title?: string } = {}) => {
  const file = await writeTemp(PDF_BYTES);
  return createContent({
    actorUserId: authorId,
    fields: {
      title: overrides.title ?? 'Staged Book',
      disciplineTag: 'SystematicTheology',
      formatTag: 'ebook',
    },
    file: {
      path: file,
      size: PDF_BYTES.length,
      mimetype: 'application/pdf',
      originalname: 'book.pdf',
    },
    maxUploadBytes: 1_000_000,
    driveThreshold: 500_000,
    drive: fakeDrive(),
    stagingDir,
  });
};

describe('createContent (integration)', () => {
  it('stages a below-threshold file, persists it, and audits creation', async () => {
    const post = await createStaged();

    expect(post.pendingAction).toBe('publish');
    expect(post.deliveryStatus).toBe('pending');
    expect(post.driveLink).toBeNull();
    expect(post.fileSizeBytes).toBe(PDF_BYTES.length);

    const { rows } = await pool.query<{ staged_file_name: string | null; staged_mime_type: string | null }>(
      'SELECT staged_file_name, staged_mime_type FROM content_posts WHERE id = $1',
      [post.id],
    );
    expect(rows[0].staged_mime_type).toBe('application/pdf');
    expect(rows[0].staged_file_name).toBeTruthy();
    await expect(stat(join(stagingDir, rows[0].staged_file_name as string))).resolves.toBeTruthy();
    expect(await auditActions(post.id)).toEqual(['content_created']);
  });

  it('routes an over-threshold file to Drive and stores the link', async () => {
    const drive = fakeDrive(true);
    const file = await writeTemp(MP4_BYTES);
    const post = await createContent({
      actorUserId: authorId,
      fields: { title: 'Lecture Recording', disciplineTag: 'SystematicTheology', formatTag: 'video_seminar' },
      file: {
        path: file,
        size: MP4_BYTES.length,
        mimetype: 'video/mp4',
        originalname: 'lecture.mp4',
      },
      maxUploadBytes: 10_000,
      driveThreshold: 4,
      drive,
      stagingDir,
    });

    expect(fakeDrive).toBeDefined();
    expect(post.driveLink).toBe('https://drive.google.com/file/d/uploaded/view');
    expect(post.fileSizeBytes).toBe(MP4_BYTES.length);
    await expect(stat(file)).rejects.toThrow();
    const { rows } = await pool.query('SELECT staged_file_name FROM content_posts WHERE id = $1', [
      post.id,
    ]);
    expect(rows[0].staged_file_name).toBeNull();
  });

  it('rejects a file whose magic bytes contradict the declared format', async () => {
    const file = await writeTemp(MP4_BYTES);
    await expect(
      createContent({
        actorUserId: authorId,
        fields: { title: 'Bad', disciplineTag: 'SystematicTheology', formatTag: 'ebook' },
        file: { path: file, size: MP4_BYTES.length, mimetype: 'application/pdf', originalname: 'x.pdf' },
        maxUploadBytes: 1_000_000,
        driveThreshold: 500_000,
        drive: fakeDrive(),
        stagingDir,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(stat(file)).rejects.toThrow();
  });
});

describe('updateContent', () => {
  it('allows the author and the admin, forbids another faculty member', async () => {
    const post = await createStaged();

    await expect(
      updateContent({ actorUserId: otherFacultyId, actorRole: 'faculty', id: post.id, patch: { title: 'Nope' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const byAuthor = await updateContent({
      actorUserId: authorId,
      actorRole: 'faculty',
      id: post.id,
      patch: { title: 'Author Rename' },
    });
    expect(byAuthor.title).toBe('Author Rename');

    const byAdmin = await updateContent({
      actorUserId: adminId,
      actorRole: 'admin',
      id: post.id,
      patch: { title: 'Admin Rename' },
    });
    expect(byAdmin.title).toBe('Admin Rename');

    expect(await auditActions(post.id)).toEqual(['content_created', 'content_updated', 'content_updated']);
  });

  it('404s an unknown id', async () => {
    await expect(
      updateContent({
        actorUserId: adminId,
        actorRole: 'admin',
        id: '00000000-0000-0000-0000-000000000000',
        patch: { title: 'x' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('deleteContent', () => {
  it('hard-deletes and unlinks a never-claimed post', async () => {
    const post = await createStaged();
    const { rows } = await pool.query<{ staged_file_name: string }>(
      'SELECT staged_file_name FROM content_posts WHERE id = $1',
      [post.id],
    );
    const stagedPath = join(stagingDir, rows[0].staged_file_name);

    const result = await deleteContent({ actorUserId: authorId, actorRole: 'faculty', id: post.id, stagingDir });

    expect(result).toEqual({ hardDeleted: true });
    const remaining = await pool.query('SELECT id FROM content_posts WHERE id = $1', [post.id]);
    expect(remaining.rowCount).toBe(0);
    await expect(stat(stagedPath)).rejects.toThrow();
  });

  it('soft-deletes and queues a channel delete for an already-posted row', async () => {
    const post = await createStaged();
    await pool.query(
      `UPDATE content_posts
          SET telegram_message_id = 777, delivery_status = 'posted', delivery_attempts = 1,
              pending_action = 'none', staged_file_name = NULL, staged_mime_type = NULL,
              staged_original_name = NULL
        WHERE id = $1`,
      [post.id],
    );

    const result = await deleteContent({ actorUserId: adminId, actorRole: 'admin', id: post.id, stagingDir });

    expect(result).toEqual({ hardDeleted: false });
    const { rows } = await pool.query<{ pending_action: string; deleted_at: Date | null }>(
      'SELECT pending_action, deleted_at FROM content_posts WHERE id = $1',
      [post.id],
    );
    expect(rows[0].pending_action).toBe('delete');
    expect(rows[0].deleted_at).not.toBeNull();
  });

  it('forbids a faculty member deleting another author post', async () => {
    const post = await createStaged();
    await expect(
      deleteContent({ actorUserId: otherFacultyId, actorRole: 'faculty', id: post.id, stagingDir }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
