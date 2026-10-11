import { mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContentPost } from '@thd/shared';

const mocks = vi.hoisted(() => ({
  insertContentPost: vi.fn(),
  getContentPostById: vi.fn(),
  getContentPostDeletionInfo: vi.fn(),
  updateContentPost: vi.fn(),
  softDeleteContentPost: vi.fn(),
  hardDeleteContentPost: vi.fn(),
  clearContentStagedFile: vi.fn(),
  listContentPosts: vi.fn(),
  insertAuditLog: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../repositories/content.repository', () => ({
  insertContentPost: mocks.insertContentPost,
  getContentPostById: mocks.getContentPostById,
  getContentPostDeletionInfo: mocks.getContentPostDeletionInfo,
  updateContentPost: mocks.updateContentPost,
  softDeleteContentPost: mocks.softDeleteContentPost,
  hardDeleteContentPost: mocks.hardDeleteContentPost,
  clearContentStagedFile: mocks.clearContentStagedFile,
  listContentPosts: mocks.listContentPosts,
}));

vi.mock('../repositories/audit-logs.repository', () => ({
  insertAuditLog: mocks.insertAuditLog,
}));

vi.mock('../db/transaction', () => ({
  withTransaction: mocks.withTransaction,
}));

import { createContent, deleteContent, updateContent } from './content.service';

const PDF_BYTES = Buffer.from('%PDF-1.7\nbody');

const makePost = (overrides: Partial<ContentPost> = {}): ContentPost => ({
  id: 'post-1',
  title: 'Grace',
  disciplineTag: 'SystematicTheology',
  formatTag: 'ebook',
  cohortTag: 2025,
  postedBy: 'faculty-1',
  telegramMessageId: null,
  driveLink: null,
  fileSizeBytes: null,
  pendingAction: 'publish',
  deliveryStatus: 'pending',
  deliveryAttempts: 0,
  deletedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

let stagingDir: string;
let tempFile: string;

const fakeDrive = (configured = true) => ({
  isConfigured: configured,
  uploadFile: vi.fn(async (file: { stream: NodeJS.ReadableStream }) => {
    await new Promise<void>((resolve) => {
      file.stream.on('end', () => resolve());
      file.stream.on('error', () => resolve());
      file.stream.resume();
    });
    return { webViewLink: 'https://drive.google.com/file/d/x/view' };
  }),
});

const writeTemp = async (bytes: Buffer): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'content-src-'));
  const path = join(dir, 'upload.bin');
  await writeFile(path, bytes);
  return path;
};

beforeEach(async () => {
  vi.clearAllMocks();
  stagingDir = await mkdtemp(join(tmpdir(), 'content-stage-'));
  tempFile = await writeTemp(PDF_BYTES);
  mocks.withTransaction.mockImplementation(async (fn: (client: unknown) => unknown) => fn({}));
  mocks.insertContentPost.mockImplementation(async (input: { title: string }) => makePost({ title: input.title }));
  mocks.insertAuditLog.mockResolvedValue(undefined);
});

describe('createContent', () => {
  it('rejects when both a file and a drive link are supplied', async () => {
    await expect(
      createContent({
        actorUserId: 'faculty-1',
        fields: { title: 'x', disciplineTag: 'SystematicTheology', formatTag: 'ebook', driveLink: 'https://drive.google.com/file/d/x/view' },
        file: { path: tempFile, size: PDF_BYTES.length, mimetype: 'application/pdf', originalname: 'x.pdf' },
        maxUploadBytes: 1000,
        driveThreshold: 500,
        drive: fakeDrive(),
        stagingDir,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects when neither a file nor a drive link is supplied', async () => {
    await expect(
      createContent({
        actorUserId: 'faculty-1',
        fields: { title: 'x', disciplineTag: 'SystematicTheology', formatTag: 'ebook' },
        file: null,
        maxUploadBytes: 1000,
        driveThreshold: 500,
        drive: fakeDrive(),
        stagingDir,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('rejects a file whose magic bytes are not allowed and removes the temp file', async () => {
    const textFile = await writeTemp(Buffer.from('not a pdf'));
    await expect(
      createContent({
        actorUserId: 'faculty-1',
        fields: { title: 'x', disciplineTag: 'SystematicTheology', formatTag: 'ebook' },
        file: { path: textFile, size: 9, mimetype: 'application/pdf', originalname: 'x.pdf' },
        maxUploadBytes: 1000,
        driveThreshold: 500,
        drive: fakeDrive(),
        stagingDir,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(stat(textFile)).rejects.toThrow();
  });

  it('rejects a file larger than the hard cap and removes the temp file', async () => {
    await expect(
      createContent({
        actorUserId: 'faculty-1',
        fields: { title: 'x', disciplineTag: 'SystematicTheology', formatTag: 'ebook' },
        file: { path: tempFile, size: PDF_BYTES.length, mimetype: 'application/pdf', originalname: 'x.pdf' },
        maxUploadBytes: 4,
        driveThreshold: 500,
        drive: fakeDrive(),
        stagingDir,
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(stat(tempFile)).rejects.toThrow();
  });

  it('uploads to drive above the threshold and links it, leaving no staged file', async () => {
    const drive = fakeDrive();
    await createContent({
      actorUserId: 'faculty-1',
      fields: { title: 'Big Book', disciplineTag: 'SystematicTheology', formatTag: 'ebook' },
      file: { path: tempFile, size: PDF_BYTES.length, mimetype: 'application/pdf', originalname: 'big.pdf' },
      maxUploadBytes: 10_000,
      driveThreshold: 5,
      drive,
      stagingDir,
    });

    expect(drive.uploadFile).toHaveBeenCalledOnce();
    const insertArg = mocks.insertContentPost.mock.calls[0][0];
    expect(insertArg.driveLink).toBe('https://drive.google.com/file/d/x/view');
    expect(insertArg.stagedFileName).toBeNull();
    expect(insertArg.fileSizeBytes).toBe(PDF_BYTES.length);
    await expect(stat(tempFile)).rejects.toThrow();
  });

  it('stages a file at or below the threshold and audits the creation', async () => {
    await createContent({
      actorUserId: 'faculty-1',
      fields: { title: 'Small Book', disciplineTag: 'SystematicTheology', formatTag: 'ebook' },
      file: { path: tempFile, size: PDF_BYTES.length, mimetype: 'application/pdf', originalname: 'small.pdf' },
      maxUploadBytes: 10_000,
      driveThreshold: 5_000,
      drive: fakeDrive(),
      stagingDir,
    });

    const insertArg = mocks.insertContentPost.mock.calls[0][0];
    expect(insertArg.stagedMimeType).toBe('application/pdf');
    expect(insertArg.stagedOriginalName).toBe('small.pdf');
    expect(typeof insertArg.stagedFileName).toBe('string');
    expect(insertArg.stagedFileName.length).toBeGreaterThan(10);
    expect(insertArg.driveLink).toBeNull();
    expect(insertArg.fileSizeBytes).toBe(PDF_BYTES.length);
    expect(insertArg.pendingAction).toBeUndefined();

    expect(mocks.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'content_created', targetType: 'content_posts' }),
      expect.anything(),
    );
  });
});

describe('updateContent', () => {
  it('404s for a missing or soft-deleted post', async () => {
    mocks.getContentPostById.mockResolvedValue(null);
    await expect(
      updateContent({ actorUserId: 'admin-1', actorRole: 'admin', id: 'x', patch: { title: 'y' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    mocks.getContentPostById.mockResolvedValue(makePost({ deletedAt: new Date().toISOString() }));
    await expect(
      updateContent({ actorUserId: 'admin-1', actorRole: 'admin', id: 'post-1', patch: { title: 'y' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('forbids a faculty member editing another author post', async () => {
    mocks.getContentPostById.mockResolvedValue(makePost({ postedBy: 'faculty-2' }));
    await expect(
      updateContent({ actorUserId: 'faculty-1', actorRole: 'faculty', id: 'post-1', patch: { title: 'y' } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('lets the author patch and audits changed keys', async () => {
    mocks.getContentPostById.mockResolvedValue(makePost());
    mocks.updateContentPost.mockResolvedValue(makePost({ title: 'Renamed' }));

    const result = await updateContent({
      actorUserId: 'faculty-1',
      actorRole: 'faculty',
      id: 'post-1',
      patch: { title: 'Renamed' },
    });

    expect(result.title).toBe('Renamed');
    expect(mocks.insertAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'content_updated',
      details: { changed: ['title'] },
    });
  });
});

describe('deleteContent', () => {
  it('hard-deletes a never-claimed post and unlinks its staged file', async () => {
    mocks.getContentPostById.mockResolvedValue(makePost());
    mocks.getContentPostDeletionInfo.mockResolvedValue({
      deliveryAttempts: 0,
      deliveryStatus: 'pending',
      telegramMessageId: null,
      stagedFileName: 'staged-1',
    });
    mocks.hardDeleteContentPost.mockResolvedValue(true);

    const result = await deleteContent({
      actorUserId: 'faculty-1',
      actorRole: 'faculty',
      id: 'post-1',
      stagingDir,
    });

    expect(result).toEqual({ hardDeleted: true });
    expect(mocks.hardDeleteContentPost).toHaveBeenCalledWith('post-1', expect.anything());
    expect(mocks.insertAuditLog.mock.calls[0][0]).toMatchObject({ action: 'content_deleted' });
  });

  it('queues a channel delete for an already-posted row', async () => {
    mocks.getContentPostById.mockResolvedValue(makePost({ telegramMessageId: 55 }));
    mocks.getContentPostDeletionInfo.mockResolvedValue({
      deliveryAttempts: 1,
      deliveryStatus: 'posted',
      telegramMessageId: 55,
      stagedFileName: null,
    });
    mocks.softDeleteContentPost.mockResolvedValue(makePost({ telegramMessageId: 55 }));

    const result = await deleteContent({
      actorUserId: 'admin-1',
      actorRole: 'admin',
      id: 'post-1',
      stagingDir,
    });

    expect(result).toEqual({ hardDeleted: false });
    expect(mocks.softDeleteContentPost).toHaveBeenCalledWith('post-1', expect.anything());
  });
});
