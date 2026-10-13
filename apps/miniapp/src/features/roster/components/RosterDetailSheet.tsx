import { Card } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CardSkeleton } from '@/components/shared/LoadingSkeletons';
import { ErrorState } from '@/components/shared/ErrorState';
import { StatusPill } from '@/components/shared/StatusPill';
import { useBackButton } from '@/hooks/use-back-button';
import { useRosterEntry } from '@/hooks/use-roster';
import { RosterStatusForm } from './RosterStatusForm';

interface RosterDetailSheetProps {
  rosterId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Detail + status editor for one scholar. Uses the additive `GET /roster/:id`. */
export function RosterDetailSheet({ rosterId, open, onOpenChange }: RosterDetailSheetProps) {
  const { data: entry, isLoading, isError, refetch } = useRosterEntry(rosterId ?? undefined);
  useBackButton(open, () => onOpenChange(false));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{entry?.registrationId ?? 'Scholar record'}</SheetTitle>
          <SheetDescription>
            {entry ? `Cohort ${entry.cohortYear} · ${entry.programTrack}` : 'Roster record'}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <CardSkeleton />
        ) : isError || !entry ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-5">
            <Card className="p-4">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd className="mt-1">
                    <StatusPill status={entry.status} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Access review</dt>
                  <dd className="mt-1 font-medium">
                    {entry.accessReviewPending ? 'Flagged' : 'Clear'}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground">Supervisor</dt>
                  <dd className="mt-1">{entry.supervisorName ?? 'Not recorded'}</dd>
                </div>
              </dl>
            </Card>

            <RosterStatusForm entry={entry} onSaved={() => onOpenChange(false)} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
