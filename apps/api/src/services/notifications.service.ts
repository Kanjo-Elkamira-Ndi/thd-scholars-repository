import { logger } from '../utils/logger';

export interface RepeatedFailureNotice {
  userId: string;
  telegramId: number;
  failureCount: number;
}

export const notifyRepeatedRegistrationFailure = async (
  notice: RepeatedFailureNotice,
): Promise<void> => {
  logger.warn(
    { userId: notice.userId, telegramId: notice.telegramId, failureCount: notice.failureCount },
    'Repeated registration failure detected — notification wiring pending (FR27)',
  );
};

export const notify = async (
  userId: string,
  event: string,
  payload: Record<string, unknown> = {},
): Promise<void> => {
  logger.info({ userId, event, payload }, 'User notification queued (FR26 wiring pending)');
};
