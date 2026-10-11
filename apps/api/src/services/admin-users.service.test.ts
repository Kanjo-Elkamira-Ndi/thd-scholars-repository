import type { User } from '@thd/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/users.repository', () => ({
  getUserById: vi.fn(),
  updateUserRole: vi.fn(),
  lockAdminRows: vi.fn(),
  countAdmins: vi.fn(),
  listUsers: vi.fn(),
}));
vi.mock('../repositories/audit-logs.repository', () => ({ insertAuditLog: vi.fn() }));
vi.mock('./notifications.service', () => ({ notify: vi.fn() }));
vi.mock('../db/transaction', () => ({
  withTransaction: (fn: (client: unknown) => unknown) => fn({}),
}));

import * as auditRepo from '../repositories/audit-logs.repository';
import * as usersRepo from '../repositories/users.repository';
import { notify } from './notifications.service';
import { changeUserRole } from './admin-users.service';

const makeUser = (over: Partial<User>): User => ({
  id: 'target',
  telegramId: 1,
  telegramUsername: null,
  fullName: 'Target User',
  email: null,
  role: 'scholar',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('changeUserRole', () => {
  it('rejects changing your own role', async () => {
    vi.mocked(usersRepo.getUserById).mockResolvedValue(makeUser({ id: 'actor', role: 'admin' }));

    await expect(changeUserRole('actor', 'scholar', 'actor')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      status: 400,
    });
    expect(usersRepo.updateUserRole).not.toHaveBeenCalled();
  });

  it('rejects demoting the last admin', async () => {
    vi.mocked(usersRepo.getUserById).mockResolvedValue(makeUser({ id: 'target', role: 'admin' }));
    vi.mocked(usersRepo.lockAdminRows).mockResolvedValue(['target']);
    vi.mocked(usersRepo.countAdmins).mockResolvedValue(1);

    await expect(changeUserRole('target', 'faculty', 'actor')).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
    expect(usersRepo.updateUserRole).not.toHaveBeenCalled();
  });

  it('promotes a user and audits the change', async () => {
    vi.mocked(usersRepo.getUserById).mockResolvedValue(makeUser({ id: 'target', role: 'scholar' }));
    vi.mocked(usersRepo.updateUserRole).mockResolvedValue(makeUser({ id: 'target', role: 'faculty' }));

    const result = await changeUserRole('target', 'faculty', 'actor');

    expect(result.role).toBe('faculty');
    expect(auditRepo.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_user_role',
        targetType: 'users',
        targetId: 'target',
        details: { from: 'scholar', to: 'faculty' },
      }),
      expect.anything(),
    );
    expect(notify).toHaveBeenCalledWith('target', 'role_changed', { from: 'scholar', to: 'faculty' });
  });

  it('allows demoting an admin when another admin remains', async () => {
    vi.mocked(usersRepo.getUserById).mockResolvedValue(makeUser({ id: 'target', role: 'admin' }));
    vi.mocked(usersRepo.lockAdminRows).mockResolvedValue(['a', 'target']);
    vi.mocked(usersRepo.countAdmins).mockResolvedValue(2);
    vi.mocked(usersRepo.updateUserRole).mockResolvedValue(makeUser({ id: 'target', role: 'faculty' }));

    await expect(changeUserRole('target', 'faculty', 'actor')).resolves.toMatchObject({
      role: 'faculty',
    });
  });
});
