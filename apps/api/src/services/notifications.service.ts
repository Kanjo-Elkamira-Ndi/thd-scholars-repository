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
