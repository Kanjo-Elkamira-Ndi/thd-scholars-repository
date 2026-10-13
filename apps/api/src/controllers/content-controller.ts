import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  CONTENT_FORMATS,
  DISCIPLINE_TAGS,
  contentCreateMultipartSchema,
  contentCreateSchema,
  contentUpdateSchema,
  type ContentCreateMultipartInput,
} from '@thd/shared';
import { env } from '../config/env';
import { createDriveService } from '../services/drive.service';
import * as contentService from '../services/content.service';
import * as settingsRepo from '../repositories/settings.repository';
import { AppError } from '../utils/errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const driveService = createDriveService({
  serviceAccountJson: env.GOOGLE_SERVICE_ACCOUNT_JSON ?? null,
  folderId: env.GOOGLE_DRIVE_FOLDER_ID ?? null,
});

const contentQuerySchema = z.object({
  discipline: z.enum(DISCIPLINE_TAGS).optional(),
  format: z.enum(CONTENT_FORMATS).optional(),
  cohortYear: z.coerce.number().int().min(1900).max(2100).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export const getContent = async (req: Request, res: Response): Promise<void> => {
  const query = contentQuerySchema.parse(req.query);
  const { items, total } = await contentService.listContent({
    disciplineTag: query.discipline,
    formatTag: query.format,
    cohortYear: query.cohortYear,
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
  });
  res.status(200).json({ items, total, page: query.page, pageSize: query.pageSize });
};

export const getContentById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid content post id', 400);
  }
  const contentPost = await contentService.getContentPost(id);
  res.status(200).json({ contentPost });
};

export const postContent = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);

  const fields: ContentCreateMultipartInput = req.file
    ? contentCreateMultipartSchema.parse(req.body)
    : contentCreateSchema.parse(req.body);

  const [maxUploadBytes, driveThreshold] = await Promise.all([
    settingsRepo.getMaxContentUploadBytes(),
    settingsRepo.getDriveThresholdBytes(),
  ]);

  const file = req.file
    ? {
        path: req.file.path,
        size: req.file.size,
        mimetype: req.file.mimetype,
        originalname: req.file.originalname,
      }
    : null;

  const contentPost = await contentService.createContent({
    actorUserId: req.user.id,
    fields,
    file,
    maxUploadBytes,
    driveThreshold,
    drive: driveService,
    stagingDir: env.CONTENT_STAGING_DIR,
  });

  res.status(201).json({ contentPost });
};

export const patchContent = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid content post id', 400);
  }
  const contentPost = await contentService.updateContent({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    id,
    patch: contentUpdateSchema.parse(req.body),
  });
  res.status(200).json({ contentPost });
};

export const deleteContent = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
  const { id } = req.params as { id: string };
  if (!UUID_RE.test(id)) {
    throw new AppError('VALIDATION_ERROR', 'Invalid content post id', 400);
  }
  const result = await contentService.deleteContent({
    actorUserId: req.user.id,
    actorRole: req.user.role,
    id,
    stagingDir: env.CONTENT_STAGING_DIR,
  });
  res.status(200).json(result);
};
