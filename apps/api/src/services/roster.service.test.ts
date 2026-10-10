import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getRegistrationIdPattern: vi.fn(),
  listRoster: vi.fn(),
  createRosterEntry: vi.fn(),
  getRosterById: vi.fn(),
  updateRosterEntry: vi.fn(),
  insertAuditLog: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../repositories/settings.repository', () => ({
  getRegistrationIdPattern: mocks.getRegistrationIdPattern,
}));
vi.mock('../repositories/roster.repository', () => ({
  listRoster: mocks.listRoster,
  createRosterEntry: mocks.createRosterEntry,
  getRosterById: mocks.getRosterById,
  updateRosterEntry: mocks.updateRosterEntry,
}));
vi.mock('../repositories/audit-logs.repository', () => ({
  insertAuditLog: mocks.insertAuditLog,
}));
vi.mock('../db/transaction', () => ({
  withTransaction: mocks.withTransaction,
}));

import { createRosterEntry, listRoster, updateRosterEntry } from './roster.service';

const existingActive = {
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
  mocks.insertAuditLog.mockResolvedValue({ id: 'al-1' });
  mocks.listRoster.mockResolvedValue({ items: [], total: 0 });
});

describe('updateRosterEntry', () => {
  it('flags access review and logs a status change when moving active → graduated', async () => {
    mocks.getRosterById.mockResolvedValue(existingActive);
    mocks.updateRosterEntry.mockResolvedValue({
      ...existingActive,
      status: 'graduated',
      accessReviewPending: true,
    });

    await updateRosterEntry({ actorUserId: 'registrar-1', id: 'r-1', patch: { status: 'graduated' } });

    const [id, patch, client] = mocks.updateRosterEntry.mock.calls[0];
    expect(id).toBe('r-1');
    expect(patch).toMatchObject({ status: 'graduated', accessReviewPending: true, updatedBy: 'registrar-1' });
    expect(patch.accessReviewFlaggedAt).toBeInstanceOf(Date);
    expect(client).toBe('client');
    expect(mocks.insertAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'update_roster_status',
      details: { from: 'active', to: 'graduated', accessReviewPending: true },
    });
  });

  it('clears the access-review flag when moving graduated → active', async () => {
    mocks.getRosterById.mockResolvedValue({
      ...existingActive,
      status: 'graduated',
      accessReviewPending: true,
    });
    mocks.updateRosterEntry.mockResolvedValue({
      ...existingActive,
      status: 'active',
      accessReviewPending: false,
    });

    await updateRosterEntry({ actorUserId: 'registrar-1', id: 'r-1', patch: { status: 'active' } });

    const [, patch] = mocks.updateRosterEntry.mock.calls[0];
    expect(patch).toMatchObject({ accessReviewPending: false, accessReviewFlaggedAt: null });
  });

  it('logs a generic entry update for a non-status patch', async () => {
    mocks.getRosterById.mockResolvedValue(existingActive);
    mocks.updateRosterEntry.mockResolvedValue({ ...existingActive, programTrack: 'New Track' });

    await updateRosterEntry({ actorUserId: 'registrar-1', id: 'r-1', patch: { programTrack: 'New Track' } });

    expect(mocks.insertAuditLog.mock.calls[0][0]).toMatchObject({
      action: 'update_roster_entry',
      details: { fields: ['programTrack'] },
    });
  });

  it('throws NOT_FOUND when the roster entry does not exist', async () => {
    mocks.getRosterById.mockResolvedValue(null);

    await expect(
      updateRosterEntry({ actorUserId: 'registrar-1', id: 'missing', patch: { status: 'active' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
});

describe('createRosterEntry', () => {
  it('creates an entry and writes an audit log', async () => {
    mocks.createRosterEntry.mockResolvedValue(existingActive);

    await createRosterEntry({
      actorUserId: 'registrar-1',
      input: { registrationId: 'DIBI-THD-0042', cohortYear: 2025, programTrack: 'Theology' },
    });

    expect(mocks.createRosterEntry).toHaveBeenCalledWith(
      { registrationId: 'DIBI-THD-0042', cohortYear: 2025, programTrack: 'Theology', supervisorName: null },
      'client',
    );
    expect(mocks.insertAuditLog.mock.calls[0][0].action).toBe('create_roster_entry');
  });

  it('maps a unique-violation into CONFLICT', async () => {
    mocks.createRosterEntry.mockRejectedValue(
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    );

    await expect(
      createRosterEntry({
        actorUserId: 'registrar-1',
        input: { registrationId: 'DIBI-THD-0042', cohortYear: 2025, programTrack: 'Theology' },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });
});

describe('listRoster', () => {
  it('delegates to the repository', async () => {
    const query = { page: 1, pageSize: 20 };
    await listRoster(query);
    expect(mocks.listRoster).toHaveBeenCalledWith(query);
  });
});
