import { z } from 'zod';
import type { RosterStatus } from '../types/enums';
import { DEFAULT_REGISTRATION_ID_REGEX } from '../constants/patterns';
import {
  cohortYearSchema,
  createRegistrationIdSchema,
  hasAtLeastOneField,
  programTrackSchema,
  supervisorNameSchema,
} from './common';

const ROSTER_STATUS_VALUES = [
  'active',
  'graduated',
  'withdrawn',
  'pending',
] as const satisfies readonly RosterStatus[];

export const createRosterCreateSchema = (registrationIdPattern: string) =>
  z.object({
    registrationId: createRegistrationIdSchema(registrationIdPattern),
    cohortYear: cohortYearSchema,
    programTrack: programTrackSchema,
    supervisorName: supervisorNameSchema.optional(),
  });

export const rosterCreateSchema = createRosterCreateSchema(DEFAULT_REGISTRATION_ID_REGEX);

export const rosterUpdateSchema = z
  .object({
    status: z.enum(ROSTER_STATUS_VALUES).optional(),
    cohortYear: cohortYearSchema.optional(),
    programTrack: programTrackSchema.optional(),
    supervisorName: supervisorNameSchema.optional(),
  })
  .refine(hasAtLeastOneField, { message: 'At least one field must be provided' });

export type RosterCreateInput = z.infer<typeof rosterCreateSchema>;
export type RosterUpdateInput = z.infer<typeof rosterUpdateSchema>;
