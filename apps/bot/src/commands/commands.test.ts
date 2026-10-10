import { describe, expect, it, vi } from 'vitest';
import { BotApiError, type BotApiClient } from '../services/api-client';
import { helpCommand } from './help';
import { mystatusCommand } from './mystatus';
import { startCommand } from './start';

const makeCtx = (fromId = 123) => {
  const reply = vi.fn().mockResolvedValue(undefined);
  return { ctx: { from: { id: fromId }, reply } as unknown as never, reply };
};

describe('commands', () => {
  it('/start replies with the welcome copy and the registration button', async () => {
    const { ctx, reply } = makeCtx();
    await startCommand(ctx, 'https://t.me/x/app');
    expect(reply).toHaveBeenCalledWith(
      expect.stringContaining('Welcome to the Th.D. Scholars Bot'),
      {
        reply_markup: {
          inline_keyboard: [[{ text: 'Open Registration', url: 'https://t.me/x/app' }]],
        },
      },
    );
  });

  it('/help replies with the help copy', async () => {
    const { ctx, reply } = makeCtx();
    await helpCommand(ctx);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('/mystatus'));
  });

  it('/mystatus renders the status from the API', async () => {
    const { ctx, reply } = makeCtx(555);
    const api = {
      getUserStatus: vi.fn().mockResolvedValue({
        user: { fullName: 'Ada', role: 'scholar', telegramId: 555 },
        roster: { registrationId: 'DIBI-THD-0001', status: 'active', accessReviewPending: false },
      }),
    } as unknown as BotApiClient;
    await mystatusCommand(ctx, api);
    expect(api.getUserStatus).toHaveBeenCalledWith(555);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining('Registration: DIBI-THD-0001'));
  });

  it('/mystatus renders the not-registered copy on 404', async () => {
    const { ctx, reply } = makeCtx();
    const api = {
      getUserStatus: vi.fn().mockRejectedValue(new BotApiError(404, 'NOT_FOUND', 'no user')),
    } as unknown as BotApiClient;
    await mystatusCommand(ctx, api);
    expect(reply).toHaveBeenCalledWith(expect.stringContaining("You're not registered yet"));
  });
});
