import { describe, expect, it, vi } from 'vitest';
import { logger } from '../utils/logger';
import { notify } from './notifications.service';

describe('notify', () => {
  it('logs the event without any PII', async () => {
    const spy = vi.spyOn(logger, 'info').mockImplementation(() => undefined);

    await notify('user-1', 'role_changed', { from: 'scholar', to: 'faculty' });

    expect(spy).toHaveBeenCalledWith(
      { userId: 'user-1', event: 'role_changed', payload: { from: 'scholar', to: 'faculty' } },
      expect.any(String),
    );
    const serialized = JSON.stringify(spy.mock.calls);
    expect(serialized).not.toMatch(/full_name|fullName|registration_id|registrationId/i);
    spy.mockRestore();
  });
});
