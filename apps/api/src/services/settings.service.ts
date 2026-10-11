import safeRegex from 'safe-regex2';
import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  type SettingsUpdateInput,
  type SystemSettings,
} from '@thd/shared';
import { withTransaction } from '../db/transaction';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as settingsRepo from '../repositories/settings.repository';
import { AppError } from '../utils/errors';

export const getSystemSettings = (): Promise<SystemSettings> => settingsRepo.getSystemSettings();

interface PendingChange {
  key: string;
  value: unknown;
}

const collectChange = (
  changes: PendingChange[],
  details: Record<string, { from: unknown; to: unknown }>,
  key: string,
  from: unknown,
  to: unknown,
): void => {
  if (to === undefined) return;
  if (JSON.stringify(from) === JSON.stringify(to)) return;
  changes.push({ key, value: to });
  details[key] = { from, to };
};

export const updateSystemSettings = async (
  input: SettingsUpdateInput,
  actorUserId: string,
): Promise<SystemSettings> => {
  const before = await settingsRepo.getSystemSettings();

  if (input.registrationIdPattern !== undefined && !safeRegex(input.registrationIdPattern)) {
    throw new AppError('VALIDATION_ERROR', 'Registration ID pattern is too complex', 400);
  }

  const changes: PendingChange[] = [];
  const details: Record<string, { from: unknown; to: unknown }> = {};
  collectChange(changes, details, 'registrationIdPattern', before.registrationIdPattern, input.registrationIdPattern);
  collectChange(changes, details, 'availableCohortYears', before.availableCohortYears, input.availableCohortYears);
  collectChange(changes, details, 'inviteLinkExpirySeconds', before.inviteLinkExpirySeconds, input.inviteLinkExpirySeconds);
  collectChange(changes, details, 'maxUploadSizeBytes', before.maxUploadSizeBytes, input.maxUploadSizeBytes);
  collectChange(changes, details, 'maxContentUploadBytes', before.maxContentUploadBytes, input.maxContentUploadBytes);

  if (changes.length === 0) {
    return before;
  }

  return withTransaction(async (client) => {
    await settingsRepo.upsertSettings(changes, actorUserId, client);
    await auditRepo.insertAuditLog(
      {
        actorUserId,
        action: AUDIT_ACTIONS.UPDATE_SETTINGS,
        targetType: AUDIT_TARGET_TYPES.SETTINGS,
        targetId: null,
        details,
      },
      client,
    );
    return settingsRepo.getSystemSettings(client);
  });
};
