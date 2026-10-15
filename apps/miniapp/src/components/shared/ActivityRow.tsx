import type { AuditAction, AuditTargetType } from '@thd/shared';
import { auditActionLabel, auditTargetTypeLabel, formatRelativeTime, shortActor } from '@/lib/audit-labels';

interface ActivityRowProps {
  action: AuditAction;
  actorUserId: string | null;
  targetType: AuditTargetType;
  createdAt: string;
}

/** One audit entry, trimmed to the four non-PII fields the dashboard exposes. */
export function ActivityRow({ action, actorUserId, targetType, createdAt }: ActivityRowProps) {
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{auditActionLabel(action)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {shortActor(actorUserId)} · {auditTargetTypeLabel(targetType)}
        </p>
      </div>
      <time
        dateTime={createdAt}
        title={new Date(createdAt).toLocaleString()}
        className="shrink-0 text-xs text-muted-foreground"
      >
        {formatRelativeTime(createdAt)}
      </time>
    </li>
  );
}
