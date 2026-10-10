import { z } from 'zod';
import { hasAtLeastOneField } from './common';

export const settingsUpdateSchema = z
  .object({
    registrationIdPattern: z
      .string({ message: 'Registration ID pattern is required' })
      .trim()
      .min(1, { message: 'Registration ID pattern must not be empty' })
      .superRefine((value, ctx) => {
        try {
          new RegExp(value);
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Must be a valid regular expression' });
        }
      })
      .optional(),
    availableCohortYears: z
      .array(
        z
          .number({ message: 'Cohort years must be numbers' })
          .int({ message: 'Cohort years must be whole numbers' })
          .min(1900, { message: 'Cohort years must be 1900 or later' })
          .max(2100, { message: 'Cohort years must be 2100 or earlier' }),
      )
      .min(1, { message: 'Provide at least one cohort year' })
      .refine((years) => new Set(years).size === years.length, {
        message: 'Cohort years must not contain duplicates',
      })
      .optional(),
    inviteLinkExpirySeconds: z
      .number({ message: 'Invite link expiry must be a number' })
      .int({ message: 'Invite link expiry must be a whole number of seconds' })
      .min(300, { message: 'Invite link expiry must be at least 300 seconds' })
      .max(2_592_000, { message: 'Invite link expiry must be 2592000 seconds (30 days) or less' })
      .optional(),
    maxUploadSizeBytes: z
      .number({ message: 'Upload size threshold must be a number' })
      .int({ message: 'Upload size threshold must be a whole number of bytes' })
      .min(1_048_576, { message: 'Upload size threshold must be at least 1048576 bytes (1 MB)' })
      .max(2_147_483_647, {
        message: 'Upload size threshold must be 2147483647 bytes (2 GB) or less',
      })
      .optional(),
  })
  .refine(hasAtLeastOneField, { message: 'At least one setting must be provided' });

export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
