import type { Role, User } from '@thd/shared';
import { withTransaction } from '../db/transaction';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as usersRepo from '../repositories/users.repository';
import { AppError } from '../utils/errors';
import { notify } from './notifications.service';
import { AUDIT_ACTIONS, AUDIT_TARGET_TYPES } from '@thd/shared';

export const listUsers = (): Promise<User[]> => usersRepo.listUsers();

export const changeUserRole = async (
  targetId: string,
  role: Role,
  actorUserId: string,
): Promise<User> => {
  return withTransaction(async (client) => {
    const target = await usersRepo.getUserById(targetId, client);
    if (!target) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }
    if (target.id === actorUserId) {
      throw new AppError('VALIDATION_ERROR', 'You cannot change your own role', 400);
    }
    if (target.role === 'admin' && role !== 'admin') {
      await usersRepo.lockAdminRows(client);
      const admins = await usersRepo.countAdmins(client);
      if (admins <= 1) {
        throw new AppError('CONFLICT', 'Cannot demote the last remaining admin', 409);
      }
    }

    const updated = await usersRepo.updateUserRole(targetId, role, client);
    if (!updated) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }

    await auditRepo.insertAuditLog(
      {
        actorUserId,
        action: AUDIT_ACTIONS.UPDATE_USER_ROLE,
        targetType: AUDIT_TARGET_TYPES.USERS,
        targetId,
        details: { from: target.role, to: role },
      },
      client,
    );
    await notify(targetId, 'role_changed', { from: target.role, to: role });

    return updated;
  });
};
