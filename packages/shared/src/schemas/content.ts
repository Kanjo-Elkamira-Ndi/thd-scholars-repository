import { z } from 'zod';
import { CONTENT_FORMATS, DISCIPLINE_TAGS } from '../constants/content';
import { cohortYearSchema, hasAtLeastOneField } from './common';

export const contentCreateSchema = z.object({
  title: z
    .string({ message: 'Title is required' })
    .trim()
    .min(1, { message: 'Title is required' })
    .max(300, { message: 'Title must be 300 characters or fewer' }),
  disciplineTag: z.enum(DISCIPLINE_TAGS),
  formatTag: z.enum(CONTENT_FORMATS),
  cohortYear: cohortYearSchema.optional(),
  driveLink: z.url({ message: 'Provide a valid URL' }).optional(),
});

export const contentUpdateSchema = contentCreateSchema
  .partial()
  .refine(hasAtLeastOneField, { message: 'At least one field must be provided' });

export type ContentCreateInput = z.infer<typeof contentCreateSchema>;
export type ContentUpdateInput = z.infer<typeof contentUpdateSchema>;
