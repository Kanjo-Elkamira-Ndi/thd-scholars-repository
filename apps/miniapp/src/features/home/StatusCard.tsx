import type { RosterEntry } from '@thd/shared';
import { CalendarDays, GraduationCap, UserRound } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusPill } from '@/components/shared/StatusPill';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto truncate font-medium">{value}</span>
    </div>
  );
}

export function StatusCard({ roster }: { roster: RosterEntry | null }) {
  if (!roster) {
    return (
      <EmptyState
        icon={UserRound}
        title="No roster record yet"
        description="Once your registration is approved, your cohort and standing will appear here."
      />
    );
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle>Roster standing</CardTitle>
        <StatusPill status={roster.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <Detail icon={CalendarDays} label="Cohort" value={String(roster.cohortYear)} />
        <Detail icon={GraduationCap} label="Track" value={roster.programTrack} />
        {roster.supervisorName ? (
          <Detail icon={UserRound} label="Supervisor" value={roster.supervisorName} />
        ) : null}
      </CardContent>
    </Card>
  );
}
