import { JOB_NAMES } from '@thd/shared';
import * as notifRepo from '../repositories/notifications.repository';
import * as rosterRepo from '../repositories/roster.repository';
import { enqueueNotification } from '../services/notifications.service';
import { weekKey } from './keys';
import type { JobDefinition, JobResult } from './run-job';

export const runAccessReviewReminder = async (ctx: {
  runKey: string;
  jobRunId: string;
}): Promise<JobResult> => {
  const count = await rosterRepo.countAccessReviewPending();
  if (count === 0) {
    return { details: { runKey: ctx.runKey, count, notified: 0 } };
  }

  const recipients = await notifRepo.findRecipientUserIds(['admin']);
  const dedupeKey = `access_review_reminder:${ctx.runKey}`;
  for (const recipientUserId of recipients) {
    await enqueueNotification({
      recipientUserId,
      event: 'access_review_reminder',
      payload: { count },
      dedupeKey,
    });
  }

  return { details: { runKey: ctx.runKey, count, notified: recipients.length } };
};

export const accessReviewReminderJob: JobDefinition = {
  name: JOB_NAMES.ACCESS_REVIEW_REMINDER,
  runKey: () => weekKey(),
  run: (ctx): Promise<JobResult> => runAccessReviewReminder(ctx),
};
