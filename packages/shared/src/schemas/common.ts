import { z } from 'zod';

export const createRegistrationIdSchema = (pattern: string) =>
  z
    .string({ message: 'Registration ID is required' })
    .trim()
    .min(1, { message: 'Registration ID is required' })
    .max(50, { message: 'Registration ID must be 50 characters or fewer' })
    .regex(new RegExp(pattern), { message: 'Registration ID does not match the required format' });

export const cohortYearSchema = z
  .number({ message: 'Cohort year is required' })
  .int({ message: 'Cohort year must be a whole number' })
  .min(1900, { message: 'Cohort year must be 1900 or later' })
  .max(2100, { message: 'Cohort year must be 2100 or earlier' });

export const programTrackSchema = z
  .string({ message: 'Program track is required' })
  .trim()
  .min(1, { message: 'Program track is required' })
  .max(200, { message: 'Program track must be 200 characters or fewer' });

export const supervisorNameSchema = z
  .string({ message: 'Supervisor name is required' })
  .trim()
  .min(1, { message: 'Supervisor name must not be empty' })
  .max(200, { message: 'Supervisor name must be 200 characters or fewer' });

export const hasAtLeastOneField = <T extends object>(value: T): boolean =>
  Object.values(value).some((fieldValue) => fieldValue !== undefined);
