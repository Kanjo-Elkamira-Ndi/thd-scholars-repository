import type { RosterStatus } from '@thd/shared';
import { Badge } from '@/components/ui/badge';

type Tone = 'default' | 'secondary' | 'outline' | 'muted' | 'success' | 'warning' | 'destructive';

const ROSTER_LABELS: Record<RosterStatus, string> = {
  active: 'Active',
  graduated: 'Graduated',
  withdrawn: 'Withdrawn',
  pending: 'Pending',
};

const ROSTER_TONES: Record<RosterStatus, Tone> = {
  active: 'success',
  graduated: 'secondary',
  withdrawn: 'destructive',
  pending: 'warning',
};

export function rosterStatusLabel(status: RosterStatus): string {
  return ROSTER_LABELS[status];
}

export function StatusPill({ status, className }: { status: RosterStatus; className?: string }) {
  return (
    <Badge variant={ROSTER_TONES[status]} className={className}>
      {ROSTER_LABELS[status]}
    </Badge>
  );
}
