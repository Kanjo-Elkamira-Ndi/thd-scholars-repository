import { Card } from '@/components/ui/card';
import { ListState } from '@/components/shared/ListState';
import { EmptyState } from '@/components/shared/EmptyState';
import { RosterAuditPill, rosterStatusLabel } from '@/components/shared/StatusPill';
import { useRosterAudit } from '@/hooks/use-roster';

function membershipSummary(membership: { isMember: boolean; checkedAt: string } | null): string {
  if (!membership) return 'Membership not checked yet';
  return membership.isMember ? 'In channel' : 'Not in channel';
}

/** Roster/membership mismatches surfaced by the quarterly audit job. */
export function AuditList() {
  const audit = useRosterAudit();
  const issues = audit.data ?? [];

  return (
    <ListState
      isLoading={audit.isLoading}
      isError={audit.isError}
      onRetry={() => void audit.refetch()}
      isEmpty={issues.length === 0}
      empty={
        <EmptyState
          title="No mismatches right now"
          description="The roster and channel membership agree."
        />
      }
    >
      <ul className="space-y-3">
        {issues.map((entry) => (
          <li key={entry.roster.id}>
            <Card className="space-y-1.5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="truncate text-sm font-semibold">{entry.roster.registrationId}</p>
                <RosterAuditPill issue={entry.issue} />
              </div>
              <p className="text-xs text-muted-foreground">
                Cohort {entry.roster.cohortYear} · {rosterStatusLabel(entry.roster.status)}
              </p>
              <p className="text-xs text-muted-foreground">{membershipSummary(entry.membership)}</p>
            </Card>
          </li>
        ))}
      </ul>
    </ListState>
  );
}
