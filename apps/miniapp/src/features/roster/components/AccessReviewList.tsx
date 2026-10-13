import type { RosterEntry } from '@thd/shared';
import { Flag } from 'lucide-react';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ListState } from '@/components/shared/ListState';
import { LoadMore } from '@/components/shared/LoadMore';
import { StatusPill } from '@/components/shared/StatusPill';
import { useMe } from '@/hooks/use-me';
import { useInfiniteRoster, useRemoveMember } from '@/hooks/use-roster';
import { isForbidden } from '@/lib/api';

const DISABLED_EXPLANATION =
  'Only the registrar who flagged this scholar (or an admin) can confirm removal.';

function formatFlaggedAt(flaggedAt: string | null): string {
  if (!flaggedAt) return 'Flagged for access review';
  const date = new Date(flaggedAt);
  return Number.isNaN(date.getTime())
    ? 'Flagged for access review'
    : `Flagged ${date.toLocaleDateString()}`;
}

/** Flagged graduated/withdrawn scholars awaiting a confirmed removal. */
export function AccessReviewList() {
  const list = useInfiniteRoster({ accessReviewPending: true });
  const me = useMe();
  const remove = useRemoveMember();
  const [target, setTarget] = useState<RosterEntry | null>(null);
  const [queued, setQueued] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const entries = list.data?.pages.flatMap((page) => page.items) ?? [];
  const role = me.data?.user.role;
  const myId = me.data?.user.id;

  const canConfirm = (entry: RosterEntry) =>
    role === 'admin' || (role === 'registrar' && entry.updatedBy === myId);

  const confirmRemoval = () => {
    if (!target?.userId) return;
    setError(null);
    remove.mutate(
      { userId: target.userId },
      {
        onSuccess: () => {
          setQueued((prev) => [...prev, target.id]);
          setTarget(null);
        },
        onError: (err) => {
          setTarget(null);
          setError(
            isForbidden(err)
              ? 'You do not have permission to remove this member.'
              : 'Could not queue the removal. Please try again.',
          );
        },
      },
    );
  };

  return (
    <>
      {error ? (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ListState
        isLoading={list.isLoading}
        isError={list.isError}
        onRetry={() => void list.refetch()}
        isEmpty={entries.length === 0}
        empty={
          <EmptyState
            title="Nothing to review"
            description="No scholars are currently flagged for access review."
          />
        }
      >
        <ul className="space-y-3">
          {entries.map((entry) => {
            const isQueued = queued.includes(entry.id);
            const hasUser = entry.userId !== null;
            return (
              <li key={entry.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold">{entry.registrationId}</p>
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Flag className="size-3.5 text-warning" aria-hidden="true" />
                        {formatFlaggedAt(entry.accessReviewFlaggedAt)}
                      </p>
                    </div>
                    <StatusPill status={entry.status} />
                  </div>

                  {isQueued ? (
                    <p
                      role="status"
                      className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-foreground"
                    >
                      Removal queued
                    </p>
                  ) : !hasUser ? (
                    <p className="text-xs text-muted-foreground">
                      This scholar is not linked to a channel member, so removal is unavailable.
                    </p>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={!canConfirm(entry)}
                        onClick={() => setTarget(entry)}
                        className="w-full"
                      >
                        Confirm removal
                      </Button>
                      {!canConfirm(entry) ? (
                        <p className="text-xs text-muted-foreground">{DISABLED_EXPLANATION}</p>
                      ) : null}
                    </>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>

        {list.hasNextPage ? (
          <LoadMore
            className="mt-3"
            onLoadMore={() => void list.fetchNextPage()}
            loading={list.isFetchingNextPage}
          />
        ) : null}
      </ListState>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title="Remove from channel"
        description="Removal is queued and the bot will remove them on its next run. The Audit tab may still list them until then."
        confirmLabel="Queue removal"
        tone="destructive"
        loading={remove.isPending}
        onConfirm={confirmRemoval}
      />
    </>
  );
}
