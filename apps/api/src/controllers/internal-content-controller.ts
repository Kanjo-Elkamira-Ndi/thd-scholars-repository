import { createReadStream } from 'node:fs';
import type { Request, Response } from 'express';
import { claimContentTasksSchema, completeContentTaskSchema } from '@thd/shared';
import { env } from '../config/env';
import * as contentService from '../services/content.service';
import { AppError } from '../utils/errors';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sanitizeFilename = (name: string): string => name.replace(/["\\\r\n]/g, '_');

export const postClaimContent = async (req: Request, res: Response): Promise<void> => {
  const parsed = claimContentTasksSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const limit = parsed.data.limit ?? env.CONTENT_DELIVERY_BATCH_SIZE;
  const result = await contentService.claimContent({ limit, stagingDir: env.CONTENT_STAGING_DIR });
  res.status(200).json(result);
};

export const postCompleteContent = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!UUID_PATTERN.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'id must be a uuid', 400);
  }
  const parsed = completeContentTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('VALIDATION_ERROR', 'Validation failed', 400, parsed.error.flatten());
  }
  const result = await contentService.completeContent({
    id,
    stagingDir: env.CONTENT_STAGING_DIR,
    ...parsed.data,
  });
  res.status(200).json(result);
};

export const getContentDownload = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!UUID_PATTERN.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'id must be a uuid', 400);
  }
  const download = await contentService.getContentDownload({
    id,
    stagingDir: env.CONTENT_STAGING_DIR,
  });
  if (!download) {
    throw new AppError('NOT_FOUND', 'Content file not found', 404);
  }
  res.setHeader('Content-Type', download.mimeType);
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${sanitizeFilename(download.originalName)}"`,
  );
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(download.path);
    stream.on('error', reject);
    stream.on('end', () => resolvePromise());
    res.on('close', () => resolvePromise());
    stream.pipe(res);
  });
};
