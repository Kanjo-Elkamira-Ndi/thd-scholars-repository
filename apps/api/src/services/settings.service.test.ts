import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SystemSettings } from '@thd/shared';

vi.mock('../repositories/settings.repository', () => ({
  getSystemSettings: vi.fn(),
  upsertSettings: vi.fn(),
}));
vi.mock('../repositories/audit-logs.repository', () => ({
  insertAuditLog: vi.fn(),
}));
vi.mock('../db/transaction', () => ({
  withTransaction: (fn: (client: unknown) => unknown) => fn({}),
}));

import * as auditRepo from '../repositories/audit-logs.repository';
import * as settingsRepo from '../repositories/settings.repository';
import { updateSystemSettings } from './settings.service';

const baseSettings: SystemSettings = {
  registrationIdPattern: '^DIBI-THD-\\d{4}$',
  availableCohortYears: [2025, 2026],
  inviteLinkExpirySeconds: 86400,
  maxUploadSizeBytes: 47185920,
  maxContentUploadBytes: 524288000,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(settingsRepo.getSystemSettings).mockResolvedValue(baseSettings);
});

describe('updateSystemSettings', () => {
  it('rejects an unsafe regular expression', async () => {
    await expect(
      updateSystemSettings({ registrationIdPattern: '(a+)+$' }, 'actor-id'),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
    expect(settingsRepo.upsertSettings).not.toHaveBeenCalled();
  });

  it('writes changed keys and audits with from/to', async () => {
    const updated = { ...baseSettings, inviteLinkExpirySeconds: 1200 };
    vi.mocked(settingsRepo.getSystemSettings)
      .mockResolvedValueOnce(baseSettings)
      .mockResolvedValueOnce(updated as SystemSettings);

    const result = await updateSystemSettings({ inviteLinkExpirySeconds: 1200 }, 'actor-id');

    expect(result.inviteLinkExpirySeconds).toBe(1200);
    expect(settingsRepo.upsertSettings).toHaveBeenCalledWith(
      [{ key: 'inviteLinkExpirySeconds', value: 1200 }],
      'actor-id',
      expect.anything(),
    );
    expect(auditRepo.insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'update_settings',
        targetType: 'settings',
        details: { inviteLinkExpirySeconds: { from: 86400, to: 1200 } },
      }),
      expect.anything(),
    );
  });

  it('does nothing when no key changed', async () => {
    const result = await updateSystemSettings({ inviteLinkExpirySeconds: 86400 }, 'actor-id');

    expect(result).toEqual(baseSettings);
    expect(settingsRepo.upsertSettings).not.toHaveBeenCalled();
    expect(auditRepo.insertAuditLog).not.toHaveBeenCalled();
  });
});
