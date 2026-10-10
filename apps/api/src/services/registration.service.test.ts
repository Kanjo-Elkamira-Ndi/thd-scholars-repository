import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@thd/shared';

const mocks = vi.hoisted(() => ({
  getRegistrationIdPattern: vi.fn(),
  findByRegistrationId: vi.fn(),
  setRosterUserId: vi.fn(),
  insertJoinRequest: vi.fn(),
  insertAuditLog: vi.fn(),
  updateUserProfile: vi.fn(),
  countRecentDeclines: vi.fn(),
  notifyRepeatedRegistrationFailure: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../repositories/settings.repository', () => ({
  getRegistrationIdPattern: mocks.getRegistrationIdPattern,
}));
vi.mock('../repositories/roster.repository', () => ({
  findByRegistrationId: mocks.findByRegistrationId,
  setRosterUserId: mocks.setRosterUserId,
}));
vi.mock('../repositories/join-requests.repository', () => ({
  insertJoinRequest: mocks.insertJoinRequest,
  countRecentDeclines: mocks.countRecentDeclines,
}));
vi.mock('../repositories/audit-logs.repository', () => ({
  insertAuditLog: mocks.insertAuditLog,
}));
vi.mock('../repositories/users.repository', () => ({
  updateUserProfile: mocks.updateUserProfile,
}));
vi.mock('./notifications.service', () => ({
  notifyRepeatedRegistrationFailure: mocks.notifyRepeatedRegistrationFailure,
}));
vi.mock('../db/transaction', () => ({
  withTransaction: mocks.withTransaction,
}));
vi.mock('../config/env', () => ({
  env: {
    REPEATED_REGISTRATION_FAILURE_THRESHOLD: 3,
    REPEATED_REGISTRATION_FAILURE_WINDOW_SECONDS: 86400,
  },
}));

import { submitRegistration } from './registration.service';

const baseUser: User = {
  id: 'user-1',
  telegramId: 111,
  telegramUsername: 'dev_scholar',
  fullName: 'Dev Scholar',
  email: null,
  role: 'scholar',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const payload = {
  fullName: 'Dev Scholar',
  registrationId: 'DIBI-THD-0042',
  cohortYear: 2025,
  email: 'dev@example.com',
  telegramUsername: 'dev_scholar',
  programTrack: 'Theology',
  declarationAccepted: true,
};

const rosterEntry = {
  id: 'r-1',
  userId: null,
  registrationId: 'DIBI-THD-0042',
  cohortYear: 2025,
  programTrack: 'Theology',
  supervisorName: null,
  status: 'active' as const,
  accessReviewPending: false,
  accessReviewFlaggedAt: null,
  updatedBy: null,
  updatedAt: '',
  createdAt: '',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getRegistrationIdPattern.mockResolvedValue('^DIBI-THD-\\d{4}$');
  mocks.withTransaction.mockImplementation(async (fn: (c: unknown) => unknown) => fn('client'));
  mocks.insertJoinRequest.mockResolvedValue({ id: 'jr-1' });
  mocks.insertAuditLog.mockResolvedValue({ id: 'al-1' });
  mocks.countRecentDeclines.mockResolvedValue(0);
  mocks.updateUserProfile.mockResolvedValue(baseUser);
});

describe('submitRegistration', () => {
  it('approves when the roster entry is active and stamps/links the profile', async () => {
    mocks.findByRegistrationId.mockResolvedValue(rosterEntry);

    const result = await submitRegistration({ user: baseUser, payload });

    expect(result).toEqual({ decision: 'approved', reason: null });
    expect(mocks.setRosterUserId).toHaveBeenCalledWith('r-1', 'user-1', 'client');
    expect(mocks.updateUserProfile).toHaveBeenCalledWith(
      'user-1',
      {
        fullName: payload.fullName,
        email: payload.email,
        telegramUsername: payload.telegramUsername,
      },
      'client',
    );
    expect(mocks.insertJoinRequest).toHaveBeenCalledWith(
      { userId: 'user-1', status: 'approved', decidedBy: null, reason: null },
      'client',
    );
    expect(mocks.insertAuditLog.mock.calls[0][0].action).toBe('approve_join_request');
    expect(mocks.notifyRepeatedRegistrationFailure).not.toHaveBeenCalled();
  });

  it('declines with a reason when there is no match', async () => {
    mocks.findByRegistrationId.mockResolvedValue(null);

    const result = await submitRegistration({ user: baseUser, payload });

    expect(result.decision).toBe('declined');
    expect(result.reason).toMatch(/no matching roster/i);
    expect(mocks.setRosterUserId).not.toHaveBeenCalled();
    expect(mocks.updateUserProfile).not.toHaveBeenCalled();
    expect(mocks.insertAuditLog.mock.calls[0][0].action).toBe('decline_join_request');
  });

  it('declines when the match is not active', async () => {
    mocks.findByRegistrationId.mockResolvedValue({ ...rosterEntry, status: 'pending' });

    const result = await submitRegistration({ user: baseUser, payload });

    expect(result.reason).toMatch(/pending/);
  });

  it('throws VALIDATION_ERROR on a bad registration id', async () => {
    await expect(
      submitRegistration({ user: baseUser, payload: { ...payload, registrationId: 'nope' } }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
    expect(mocks.withTransaction).not.toHaveBeenCalled();
  });

  it('notifies when declines reach the threshold', async () => {
    mocks.findByRegistrationId.mockResolvedValue(null);
    mocks.countRecentDeclines.mockResolvedValue(3);

    await submitRegistration({ user: baseUser, payload });

    expect(mocks.notifyRepeatedRegistrationFailure).toHaveBeenCalledWith({
      userId: 'user-1',
      telegramId: 111,
      failureCount: 3,
    });
  });
});
