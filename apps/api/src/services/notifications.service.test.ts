import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/notifications.repository', () => ({
  insertNotification: vi.fn(),
  findRecipientUserIds: vi.fn(),
}));

import { logger } from '../utils/logger';
import * as repo from '../repositories/notifications.repository';
import {
  notify,
  notifyRepeatedRegistrationFailure,
  notifyRoleChanged,
} from './notifications.service';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  vi.mocked(repo.insertNotification).mockResolvedValue({ id: 'n1' } as never);
});

describe('notifications.service', () => {
  it('enqueues a role change with a unique dedupe key and no PII', async () => {
    await notifyRoleChanged('user-1', 'scholar', 'faculty');

    expect(repo.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientUserId: 'user-1',
        event: 'role_changed',
        payload: { from: 'scholar', to: 'faculty' },
      }),
      undefined,
    );
    const arg = vi.mocked(repo.insertNotification).mock.calls[0][0];
    expect(arg.dedupeKey.length).toBeGreaterThan(10);
    const serialized = JSON.stringify(vi.mocked(repo.insertNotification).mock.calls);
    expect(serialized).not.toMatch(/full_name|fullName|registration_id|registrationId/i);
  });

  it('forwards an explicit payload for generic notifications', async () => {
    await notify('u', 'member_removal_requested', { initiatedByRole: 'admin' });
    expect(repo.insertNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'member_removal_requested',
        payload: { initiatedByRole: 'admin' },
      }),
      undefined,
    );
  });

  it('fans repeated registration failures out to admins and registrars', async () => {
    vi.mocked(repo.findRecipientUserIds).mockResolvedValue(['a', 'b']);
    const queued = await notifyRepeatedRegistrationFailure({
      userId: 'u1',
      telegramId: 5,
      failureCount: 3,
    });
    expect(repo.findRecipientUserIds).toHaveBeenCalledWith(['admin', 'registrar']);
    expect(queued).toBe(2);
  });
});
