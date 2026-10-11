import type { JoinRequestDeliveryTask } from '@thd/shared';
import type { Logger } from 'pino';
import type { Telegraf } from 'telegraf';
import { renderApproval, renderDecline, renderInviteLink } from '../templates';
import { isJoinRequestGone } from '../utils/telegram-errors';
import type { BotApiClient } from './api-client';

export interface DeliveryDeps {
  api: BotApiClient;
  telegram: Telegraf['telegram'];
  channelId: string;
  logger: Pick<Logger, 'warn' | 'info' | 'error'>;
}

export interface DeliveryLoopDeps extends DeliveryDeps {
  intervalMs: number;
  batchSize: number;
}

const MEMBER_STATUSES = new Set(['member', 'administrator', 'creator']);

const isChannelMember = async (
  telegram: Telegraf['telegram'],
  channelId: string,
  telegramUserId: number,
): Promise<boolean> => {
  const member = await telegram.getChatMember(channelId, telegramUserId);
  return MEMBER_STATUSES.has(member.status);
};

const sendDm = async (
  telegram: Telegraf['telegram'],
  telegramUserId: number,
  text: string,
  logger: DeliveryDeps['logger'],
): Promise<void> => {
  try {
    await telegram.sendMessage(telegramUserId, text);
  } catch (err) {
    logger.warn({ err, telegramId: telegramUserId }, 'join-request DM failed (non-fatal)');
  }
};

const deliverInvite = async (
  task: JoinRequestDeliveryTask,
  { api, telegram, channelId }: DeliveryDeps,
  inviteLinkExpirySeconds: number,
): Promise<void> => {
  const expireDate = Math.floor(Date.now() / 1000) + inviteLinkExpirySeconds;
  const expiresAt = new Date(expireDate * 1000).toISOString();
  const invite = await telegram.createChatInviteLink(channelId, {
    member_limit: 1,
    expire_date: expireDate,
  });
  const link = invite.invite_link;

  try {
    await telegram.sendMessage(
      task.telegramId,
      renderInviteLink({
        name: task.fullName,
        link,
        expiresInHours: Math.round(inviteLinkExpirySeconds / 3600),
      }),
    );
  } catch (err) {
    await revokeBestEffort(telegram, channelId, link);
    await api.completeJoinRequest(task.id, {
      outcome: 'failed',
      error: (err as Error).message,
    });
    return;
  }

  await api.completeJoinRequest(task.id, {
    outcome: 'delivered',
    inviteLink: { link, expiresAt },
  });
};

const revokeBestEffort = async (
  telegram: Telegraf['telegram'],
  channelId: string,
  link: string,
): Promise<void> => {
  try {
    await telegram.revokeChatInviteLink(channelId, link);
  } catch {
    // best-effort: the link still expires on its own
  }
};

const deliverApproval = async (
  task: JoinRequestDeliveryTask,
  deps: DeliveryDeps,
  inviteLinkExpirySeconds: number,
): Promise<void> => {
  const { api, telegram, channelId } = deps;

  if (task.chatId === null) {
    await deliverInvite(task, deps, inviteLinkExpirySeconds);
    return;
  }

  try {
    await telegram.approveChatJoinRequest(task.chatId, task.telegramId);
  } catch (err) {
    if (!isJoinRequestGone(err)) {
      throw err;
    }
    if (!(await isChannelMember(telegram, channelId, task.telegramId))) {
      await deliverInvite(task, deps, inviteLinkExpirySeconds);
      return;
    }
    await api.completeJoinRequest(task.id, { outcome: 'delivered' });
    return;
  }

  await sendDm(telegram, task.telegramId, renderApproval({ name: task.fullName }), deps.logger);
  await api.completeJoinRequest(task.id, { outcome: 'delivered' });
};

const deliverDecline = async (
  task: JoinRequestDeliveryTask,
  { api, telegram, logger }: DeliveryDeps,
  callTelegram: boolean,
): Promise<void> => {
  if (callTelegram) {
    try {
      await telegram.declineChatJoinRequest(task.chatId as number, task.telegramId);
    } catch (err) {
      if (!isJoinRequestGone(err)) {
        throw err;
      }
    }
  }
  const reason = task.reason ?? 'Your registration could not be verified.';
  await sendDm(telegram, task.telegramId, renderDecline({ reason }), logger);
  await api.completeJoinRequest(task.id, { outcome: 'delivered' });
};

export const deliverTask = async (
  task: JoinRequestDeliveryTask,
  deps: DeliveryDeps,
  inviteLinkExpirySeconds: number,
): Promise<void> => {
  try {
    if (task.decision === 'approved') {
      await deliverApproval(task, deps, inviteLinkExpirySeconds);
    } else {
      await deliverDecline(task, deps, task.chatId !== null);
    }
  } catch (err) {
    deps.logger.error({ err, joinRequestId: task.id }, 'join-request delivery action threw');
    await deps.api
      .completeJoinRequest(task.id, { outcome: 'failed', error: (err as Error).message })
      .catch((reportErr) => {
        deps.logger.error({ err: reportErr }, 'failed to report delivery failure');
      });
  }
};

export const runDeliveryTick = async (deps: DeliveryLoopDeps): Promise<void> => {
  const { items, inviteLinkExpirySeconds } = await deps.api.claimJoinRequests({
    limit: deps.batchSize,
  });
  await Promise.all(items.map((task) => deliverTask(task, deps, inviteLinkExpirySeconds)));
};

let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;

export const startDeliveryLoop = (deps: DeliveryLoopDeps): void => {
  if (running) {
    return;
  }
  running = true;
  deps.logger.info(
    { intervalMs: deps.intervalMs, batchSize: deps.batchSize },
    'join-request delivery loop started',
  );
  const tick = async (): Promise<void> => {
    if (!running) {
      return;
    }
    try {
      await runDeliveryTick(deps);
    } catch (err) {
      deps.logger.error({ err }, 'join-request delivery tick failed');
    }
    if (running) {
      timer = setTimeout(() => void tick(), deps.intervalMs);
    }
  };
  void tick();
};

export const stopDeliveryLoop = (): void => {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
};
