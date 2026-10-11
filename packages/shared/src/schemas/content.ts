import { z } from 'zod';
import { CONTENT_FORMATS, CONTENT_TITLE_MAX_LENGTH, DISCIPLINE_TAGS } from '../constants/content';
import { cohortYearSchema, hasAtLeastOneField } from './common';

const disciplineTagSchema = z.enum(DISCIPLINE_TAGS);

const formatTagSchema = z.enum(CONTENT_FORMATS);

const titleSchema = z
  .string({ message: 'Title is required' })
  .trim()
  .min(1, { message: 'Title is required' })
  .max(CONTENT_TITLE_MAX_LENGTH, {
    message: `Title must be ${CONTENT_TITLE_MAX_LENGTH} characters or fewer`,
  });

export const driveLinkSchema = z
  .string({ message: 'Drive link is required' })
  .trim()
  .url({ message: 'Drive link must be a valid URL' })
  .refine((value) => value.startsWith('https://'), {
    message: 'Drive link must use https',
  })
  .refine(
    (value) => {
      try {
        const host = new URL(value).hostname;
        return host === 'drive.google.com' || host === 'docs.google.com';
      } catch {
        return false;
      }
    },
    { message: 'Drive link must be a Google Drive or Google Docs link' },
  );

export const contentCreateSchema = z.object({
  title: titleSchema,
  disciplineTag: disciplineTagSchema,
  formatTag: formatTagSchema,
  cohortYear: cohortYearSchema.optional(),
  driveLink: driveLinkSchema.optional(),
});

export type ContentCreateInput = z.infer<typeof contentCreateSchema>;

export const contentCreateMultipartSchema = z.object({
  title: titleSchema,
  disciplineTag: disciplineTagSchema,
  formatTag: formatTagSchema,
  cohortYear: z.coerce
    .number({ message: 'Cohort year must be a number' })
    .int({ message: 'Cohort year must be a whole number' })
    .min(1900, { message: 'Cohort year must be 1900 or later' })
    .max(2100, { message: 'Cohort year must be 2100 or earlier' })
    .optional(),
  driveLink: driveLinkSchema.optional(),
});

export type ContentCreateMultipartInput = z.infer<typeof contentCreateMultipartSchema>;

export const contentUpdateSchema = z
  .object({
    title: titleSchema.optional(),
    disciplineTag: disciplineTagSchema.optional(),
    formatTag: formatTagSchema.optional(),
    cohortYear: cohortYearSchema.optional(),
  })
  .refine(hasAtLeastOneField, { message: 'At least one field must be provided' });

export type ContentUpdateInput = z.infer<typeof contentUpdateSchema>;
