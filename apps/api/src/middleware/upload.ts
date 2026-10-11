import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import type { NextFunction, Request, Response } from 'express';
import multer, { MulterError } from 'multer';
import { env } from '../config/env';
import { AppError } from '../utils/errors';

mkdirSync(env.CONTENT_STAGING_DIR, { recursive: true });

export const contentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, env.CONTENT_STAGING_DIR),
    filename: (_req, _file, cb) => cb(null, randomUUID()),
  }),
  limits: { files: 1, fileSize: 2147483648 },
});

const single = contentUpload.single('file');

export function uploadSingle(req: Request, res: Response, next: NextFunction): void {
  single(req, res, (error: unknown) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        next(new AppError('VALIDATION_ERROR', 'File exceeds the maximum upload size', 400));
        return;
      }
      next(new AppError('VALIDATION_ERROR', error.message, 400));
      return;
    }
    next(error);
  });
}
