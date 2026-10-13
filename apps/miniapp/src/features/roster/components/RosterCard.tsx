import type { RosterEntry } from '@thd/shared';
import { Flag } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/shared/StatusPill';

interface RosterCardProps {
  entry: RosterEntry;
  onOpen: () => void;
}

/** One roster row. Roster screens are staff-only, so the registration id is safe here. */
export function RosterCard({ entry, onOpen }: RosterCardProps) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg text-left">
      <Card className="p-4 transition-colors hover:bg-accent">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-semibold">{entry.registrationId}</p>
            <p className="truncate text-xs text-muted-foreground">
              Cohort {entry.cohortYear} · {entry.programTrack}
            </p>
            {entry.supervisorName ? (
              <p className="truncate text-xs text-muted-foreground">
                Supervisor: {entry.supervisorName}
              </p>
            ) : null}
          </div>
          <StatusPill status={entry.status} />
        </div>
        {entry.accessReviewPending ? (
          <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-warning">
            <Flag className="size-3.5" aria-hidden="true" />
            Flagged for access review
          </p>
        ) : null}
      </Card>
    </button>
  );
}
