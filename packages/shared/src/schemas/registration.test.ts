import { describe, expect, it } from 'vitest';
import { createRegistrationPayloadSchema, type RegistrationResult } from './registration';

const build = () => createRegistrationPayloadSchema('^DIBI-THD-\\d{4}$');

const payload = {
  fullName: 'Dev Scholar',
  registrationId: 'DIBI-THD-0042',
  cohortYear: 2025,
  email: 'dev@example.com',
  telegramUsername: '@dev_scholar',
  programTrack: 'Theology',
  declarationAccepted: true,
};

describe('createRegistrationPayloadSchema', () => {
  it('accepts a well-formed payload', () => {
    expect(build().safeParse(payload).success).toBe(true);
  });

  it('rejects a registration id that does not match the configured pattern', () => {
    expect(build().safeParse({ ...payload, registrationId: 'nope' }).success).toBe(false);
  });

  it('requires the declaration to be accepted', () => {
    expect(build().safeParse({ ...payload, declarationAccepted: false }).success).toBe(false);
  });

  it('exposes a RegistrationResult shape', () => {
    const result: RegistrationResult = { decision: 'approved', reason: null };
    expect(result.decision).toBe('approved');
  });
});
