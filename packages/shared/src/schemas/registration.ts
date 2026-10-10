import { z } from 'zod';
import { DEFAULT_REGISTRATION_ID_REGEX } from '../constants/patterns';
import {
  cohortYearSchema,
  createRegistrationIdSchema,
  programTrackSchema,
  supervisorNameSchema,
} from './common';

const TELEGRAM_USERNAME_REGEX = /^@?[A-Za-z0-9_]{5,32}$/;

export const createRegistrationPayloadSchema = (registrationIdPattern: string) =>
  z.object({
    fullName: z
      .string({ message: 'Full name is required' })
      .trim()
      .min(2, { message: 'Full name must be at least 2 characters' })
      .max(200, { message: 'Full name must be 200 characters or fewer' }),
    registrationId: createRegistrationIdSchema(registrationIdPattern),
    cohortYear: cohortYearSchema,
    email: z.email({ message: 'Enter a valid email address' }),
    telegramUsername: z
      .string({ message: 'Telegram username is required' })
      .trim()
      .regex(TELEGRAM_USERNAME_REGEX, {
        message: 'Telegram username must be 5–32 letters, numbers, or underscores (optional @)',
      }),
    programTrack: programTrackSchema,
    supervisorName: supervisorNameSchema.optional(),
    declarationAccepted: z.literal(true, {
      message: 'You must accept the declaration to register',
    }),
  });

export const registrationPayloadSchema = createRegistrationPayloadSchema(
  DEFAULT_REGISTRATION_ID_REGEX,
);

export interface RegistrationResult {
  decision: 'approved' | 'declined';
  reason: string | null;
}

export type RegistrationPayload = z.infer<typeof registrationPayloadSchema>;
