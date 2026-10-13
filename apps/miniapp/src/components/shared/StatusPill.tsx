import type { ContentDeliveryStatus, RosterAuditIssue, RosterStatus } from '@thd/shared';
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

const DELIVERY_LABELS: Record<ContentDeliveryStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  posted: 'Posted',
  failed: 'Failed',
};

const DELIVERY_TONES: Record<ContentDeliveryStatus, Tone> = {
  pending: 'warning',
  processing: 'muted',
  posted: 'success',
  failed: 'destructive',
};

const AUDIT_LABELS: Record<RosterAuditIssue, string> = {
  active_not_member: 'Active but not in channel',
  inactive_still_member: 'Inactive but still in channel',
  membership_unknown: 'Membership unknown',
};

const AUDIT_TONES: Record<RosterAuditIssue, Tone> = {
  active_not_member: 'destructive',
  inactive_still_member: 'warning',
  membership_unknown: 'muted',
};

export type { Tone };

export function rosterStatusLabel(status: RosterStatus): string {
  return ROSTER_LABELS[status];
}

export function contentDeliveryLabel(status: ContentDeliveryStatus): string {
  return DELIVERY_LABELS[status];
}

export function rosterAuditLabel(issue: RosterAuditIssue): string {
  return AUDIT_LABELS[issue];
}

/** Generic toned badge. */
export function Pill({
  tone = 'default',
  className,
  ...props
}: { tone?: Tone } & React.ComponentProps<typeof Badge>) {
  return <Badge variant={tone} className={className} {...props} />;
}

export function StatusPill({ status, className }: { status: RosterStatus; className?: string }) {
  return (
    <Badge variant={ROSTER_TONES[status]} className={className}>
      {ROSTER_LABELS[status]}
    </Badge>
  );
}

/** Delivery state of a content post (pending/processing/posted/failed). */
export function ContentDeliveryPill({
  status,
  className,
}: {
  status: ContentDeliveryStatus;
  className?: string;
}) {
  return (
    <Badge variant={DELIVERY_TONES[status]} className={className}>
      {DELIVERY_LABELS[status]}
    </Badge>
  );
}

/** Roster/membership inconsistency badge for the audit segment. */
export function RosterAuditPill({
  issue,
  className,
}: {
  issue: RosterAuditIssue;
  className?: string;
}) {
  return (
    <Badge variant={AUDIT_TONES[issue]} className={className}>
      {AUDIT_LABELS[issue]}
    </Badge>
  );
}
