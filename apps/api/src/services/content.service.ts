import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, open, rename, unlink } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ClaimContentTasksResponse,
  CompleteContentTaskInput,
  ContentCreateMultipartInput,
  ContentDeliveryStatus,
  ContentDeliveryTask,
  ContentUpdateInput,
  ContentPost,
  Role,
} from '@thd/shared';
import { CONTENT_MIME_WHITELIST } from '@thd/shared';
import { env } from '../config/env';
import { withTransaction } from '../db/transaction';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as contentRepo from '../repositories/content.repository';
import type { DriveService } from './drive.service';
import { AppError } from '../utils/errors';
import { detectMime } from '../utils/file-type';
import { computeBackoffSeconds } from '../utils/backoff';

export interface StagedUpload {
  path: string;
  size: number;
  mimetype: string;
  originalname: string;
}

export interface CreateContentInput {
  actorUserId: string;
  fields: ContentCreateMultipartInput;
  file: StagedUpload | null;
  maxUploadBytes: number;
  driveThreshold: number;
  drive: DriveService;
  stagingDir: string;
}

const MAX_HEAD_BYTES = 4096;

async function readHead(path: string): Promise<Buffer> {
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(MAX_HEAD_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, MAX_HEAD_BYTES, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function safeUnlink(path: string | null): Promise<void> {
  if (!path) return;
  try {
    await unlink(path);
  } catch {
    // best-effort cleanup
  }
}

async function moveInto(stagingDir: string, sourcePath: string): Promise<string> {
  await mkdir(stagingDir, { recursive: true });
  const destination = join(stagingDir, randomUUID());
  try {
    await rename(sourcePath, destination);
  } catch {
    await copyFile(sourcePath, destination);
    await safeUnlink(sourcePath);
  }
  return destination;
}

function assertOwnership(post: ContentPost, actorUserId: string, actorRole: Role): void {
  if (actorRole === 'admin' || post.postedBy === actorUserId) return;
  throw new AppError('FORBIDDEN', 'You can only manage your own content posts', 403);
}

export async function createContent(input: CreateContentInput): Promise<ContentPost> {
  const { fields, file } = input;
  const hasFile = file !== null;
  const hasLink = Boolean(fields.driveLink);
  if (hasFile === hasLink) {
    throw new AppError(
      'VALIDATION_ERROR',
      'Provide exactly one of a file or a Drive link',
      400,
    );
  }

  let driveLink = fields.driveLink ?? null;
  let stagedFileName: string | null = null;
  let stagedMimeType: string | null = null;
  let stagedOriginalName: string | null = null;
  let fileSizeBytes: number | null = null;
  let cleanupPath: string | null = file ? file.path : null;

  try {
    if (file) {
      const detected = detectMime(await readHead(file.path));
      const allowed = CONTENT_MIME_WHITELIST[fields.formatTag];
      if (!allowed.includes(file.mimetype) || !detected || !allowed.includes(detected)) {
        throw new AppError('VALIDATION_ERROR', 'File type is unrecognized or does not match the selected format', 400);
      }
      if (file.size > input.maxUploadBytes) {
        throw new AppError('VALIDATION_ERROR', 'File exceeds the maximum upload size', 400);
      }

      fileSizeBytes = file.size;

      if (file.size > input.driveThreshold) {
        if (!input.drive.isConfigured) {
          throw new AppError('INTERNAL_ERROR', 'Google Drive is not configured for large uploads');
        }
        const { webViewLink } = await input.drive.uploadFile(
          { stream: createReadStream(file.path), byteLength: file.size },
          { mimeType: detected, name: file.originalname },
        );
        driveLink = webViewLink;
        await safeUnlink(file.path);
        cleanupPath = null;
      } else {
        const destination = await moveInto(input.stagingDir, file.path);
        cleanupPath = null;
        stagedFileName = basename(destination);
        stagedMimeType = detected;
        stagedOriginalName = file.originalname;
      }
    }

    return await withTransaction(async (client) => {
      const created = await contentRepo.insertContentPost(
        {
          title: fields.title,
          disciplineTag: fields.disciplineTag,
          formatTag: fields.formatTag,
          cohortTag: fields.cohortYear ?? null,
          postedBy: input.actorUserId,
          driveLink,
          fileSizeBytes,
          stagedFileName,
          stagedMimeType,
          stagedOriginalName,
        },
        client,
      );
      await auditRepo.insertAuditLog(
        {
          actorUserId: input.actorUserId,
          action: 'content_created',
          targetType: 'content_posts',
          targetId: created.id,
          details: { title: created.title },
        },
        client,
      );
      return created;
    });
  } catch (error) {
    await safeUnlink(cleanupPath);
    throw error;
  }
}

export function listContent(filters: contentRepo.ContentListFilters) {
  return contentRepo.listContentPosts(filters);
}

export async function updateContent(input: {
  actorUserId: string;
  actorRole: Role;
  id: string;
  patch: ContentUpdateInput;
}): Promise<ContentPost> {
  const post = await contentRepo.getContentPostById(input.id);
  if (!post || post.deletedAt !== null) {
    throw new AppError('NOT_FOUND', 'Content post not found', 404);
  }
  assertOwnership(post, input.actorUserId, input.actorRole);

  return withTransaction(async (client) => {
    const updated = await contentRepo.updateContentPost(
      input.id,
      {
        title: input.patch.title,
        disciplineTag: input.patch.disciplineTag,
        formatTag: input.patch.formatTag,
        cohortTag: input.patch.cohortYear,
      },
      client,
    );
    if (!updated) {
      throw new AppError('NOT_FOUND', 'Content post not found', 404);
    }
    await auditRepo.insertAuditLog(
      {
        actorUserId: input.actorUserId,
        action: 'content_updated',
        targetType: 'content_posts',
        targetId: updated.id,
        details: { title: updated.title, changed: Object.keys(input.patch) },
      },
      client,
    );
    return updated;
  });
}

export async function deleteContent(input: {
  actorUserId: string;
  actorRole: Role;
  id: string;
  stagingDir: string;
}): Promise<{ hardDeleted: boolean }> {
  const post = await contentRepo.getContentPostById(input.id);
  if (!post || post.deletedAt !== null) {
    throw new AppError('NOT_FOUND', 'Content post not found', 404);
  }
  assertOwnership(post, input.actorUserId, input.actorRole);

  const info = await contentRepo.getContentPostDeletionInfo(input.id);
  if (!info) {
    throw new AppError('NOT_FOUND', 'Content post not found', 404);
  }

  const neverClaimed =
    info.telegramMessageId === null &&
    info.deliveryAttempts === 0 &&
    info.deliveryStatus === 'pending';

  return withTransaction(async (client) => {
    if (neverClaimed) {
      await safeUnlink(info.stagedFileName ? join(input.stagingDir, info.stagedFileName) : null);
      await contentRepo.hardDeleteContentPost(input.id, client);
    } else {
      await contentRepo.softDeleteContentPost(input.id, client);
    }
    await auditRepo.insertAuditLog(
      {
        actorUserId: input.actorUserId,
        action: 'content_deleted',
        targetType: 'content_posts',
        targetId: input.id,
        details: { title: post.title, hardDeleted: neverClaimed },
      },
      client,
    );
    return { hardDeleted: neverClaimed };
  });
}

export interface ContentDownload {
  path: string;
  mimeType: string;
  originalName: string;
}

const stagedPathFor = (stagingDir: string, stagedFileName: string): string =>
  resolve(stagingDir, stagedFileName);

export async function claimContent(input: {
  limit: number;
  stagingDir: string;
}): Promise<ClaimContentTasksResponse> {
  const records = await contentRepo.claimContentTasks({
    limit: input.limit,
    leaseSeconds: env.CONTENT_DELIVERY_LEASE_SECONDS,
  });

  const items: ContentDeliveryTask[] = [];
  for (const record of records) {
    if (record.hasStagedFile && record.stagedFileName) {
      const stagedPath = stagedPathFor(input.stagingDir, record.stagedFileName);
      if (!existsSync(stagedPath)) {
        await contentRepo.markContentFailed(record.id, {
          error: 'staged file missing',
          terminal: true,
        });
        await auditRepo.insertAuditLog({
          actorUserId: null,
          action: 'content_delivery_failed',
          targetType: 'content_posts',
          targetId: record.id,
          details: {
            title: record.title,
            action: record.action,
            attempts: record.attempts,
            error: 'staged file missing',
          },
        });
        continue;
      }
    }

    items.push({
      id: record.id,
      action: record.action,
      title: record.title,
      disciplineTag: record.disciplineTag,
      formatTag: record.formatTag,
      cohortTag: record.cohortTag,
      telegramMessageId: record.telegramMessageId,
      driveLink: record.driveLink,
      hasStagedFile: record.hasStagedFile,
      stagedMimeType: record.stagedMimeType,
      stagedOriginalName: record.stagedOriginalName,
    });
  }

  return { items };
}

export async function completeContent(
  input: { id: string; stagingDir: string } & CompleteContentTaskInput,
): Promise<{ deliveryStatus: ContentDeliveryStatus; hardDeleted?: true }> {
  const record = await contentRepo.getContentDeliveryRecord(input.id);

  if (input.outcome === 'posted') {
    if (!record) return { deliveryStatus: 'posted' };
    const stagedPath = record.stagedFileName
      ? stagedPathFor(input.stagingDir, record.stagedFileName)
      : null;
    const wasDelete = record.action === 'delete';

    await withTransaction(async (client) => {
      await contentRepo.markContentPosted(input.id, input.telegramMessageId as number, client);
      await contentRepo.clearContentStagedFile(input.id, client);
      await auditRepo.insertAuditLog(
        {
          actorUserId: null,
          action: 'content_posted',
          targetType: 'content_posts',
          targetId: input.id,
          details: { title: record.title, telegramMessageId: input.telegramMessageId },
        },
        client,
      );
    });

    if (stagedPath) await safeUnlink(stagedPath);
    return { deliveryStatus: wasDelete ? 'pending' : 'posted' };
  }

  if (input.outcome === 'deleted') {
    if (record?.stagedFileName) {
      await safeUnlink(stagedPathFor(input.stagingDir, record.stagedFileName));
    }
    await contentRepo.hardDeleteContentPost(input.id);
    return { deliveryStatus: 'posted', hardDeleted: true };
  }

  if (!record) {
    throw new AppError('NOT_FOUND', 'Content post not found', 404);
  }

  const error = input.error ?? 'unknown error';
  const terminal = input.terminal === true || record.attempts >= env.CONTENT_DELIVERY_MAX_ATTEMPTS;
  if (!terminal) {
    const backoffSeconds = computeBackoffSeconds(
      record.attempts,
      env.CONTENT_DELIVERY_BACKOFF_BASE_SECONDS,
    );
    await contentRepo.rescheduleContentTask(input.id, {
      error,
      nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000),
    });
    return { deliveryStatus: 'pending' };
  }

  await contentRepo.markContentFailed(input.id, { error, terminal: true });
  await auditRepo.insertAuditLog({
    actorUserId: null,
    action: 'content_delivery_failed',
    targetType: 'content_posts',
    targetId: input.id,
    details: { title: record.title, action: record.action, attempts: record.attempts, error },
  });
  return { deliveryStatus: 'failed' };
}

export async function getContentDownload(input: {
  id: string;
  stagingDir: string;
}): Promise<ContentDownload | null> {
  const record = await contentRepo.getContentDeliveryRecord(input.id);
  if (!record || !record.stagedFileName) return null;
  const stagedPath = stagedPathFor(input.stagingDir, record.stagedFileName);
  if (!existsSync(stagedPath)) return null;
  return {
    path: stagedPath,
    mimeType: record.stagedMimeType ?? 'application/octet-stream',
    originalName: record.stagedOriginalName ?? 'download',
  };
}
