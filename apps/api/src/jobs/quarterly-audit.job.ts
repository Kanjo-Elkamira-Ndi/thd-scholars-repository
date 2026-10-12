import {
  AUDIT_ACTIONS,
  AUDIT_TARGET_TYPES,
  JOB_NAMES,
  type RosterAuditIssue,
} from '@thd/shared';
import * as auditRepo from '../repositories/audit-logs.repository';
import * as notifRepo from '../repositories/notifications.repository';
import { enqueueNotification } from '../services/notifications.service';
import { computeRosterAudit } from '../services/roster-audit.service';
import { quarterKey } from './keys';
import type { JobDefinition, JobResult } from './run-job';

export const runQuarterlyAudit = async (ctx: {
  runKey: string;
  jobRunId: string;
}): Promise<JobResult> => {
  const entries = await computeRosterAudit();

  const counts: Record<RosterAuditIssue, number> = {
    active_not_member: 0,
    inactive_still_member: 0,
    membership_unknown: 0,
  };
  for (const entry of entries) {
    counts[entry.issue] += 1;
  }

  await auditRepo.insertAuditLog({
    actorUserId: null,
    action: AUDIT_ACTIONS.QUARTERLY_ROSTER_AUDIT,
    targetType: AUDIT_TARGET_TYPES.JOBS,
    targetId: ctx.jobRunId,
    details: {
      runKey: ctx.runKey,
      counts: { active_not_member: counts.active_not_member, inactive_still_member: counts.inactive_still_member, membership_unknown: counts.membership_unknown },
      total: entries.length,
    },
  });

  const recipients = await notifRepo.findRecipientUserIds(['admin']);
  const dedupeKey = `quarterly_audit:${ctx.runKey}`;
  for (const recipientUserId of recipients) {
    await enqueueNotification({
      recipientUserId,
      event: 'audit_flagged',
      payload: { runKey: ctx.runKey, total: entries.length },
      dedupeKey,
    });
  }

  return { details: { runKey: ctx.runKey, counts, total: entries.length, notified: recipients.length } };
};

export const quarterlyAuditJob: JobDefinition = {
  name: JOB_NAMES.QUARTERLY_AUDIT,
  runKey: () => quarterKey(),
  run: (ctx): Promise<JobResult> => runQuarterlyAudit(ctx),
};
