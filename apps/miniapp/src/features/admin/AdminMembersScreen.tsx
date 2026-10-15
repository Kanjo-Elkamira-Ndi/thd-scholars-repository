import type { MemberSummary } from '@thd/shared';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ListState } from '@/components/shared/ListState';
import { Pill, StatusPill } from '@/components/shared/StatusPill';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { useMembers } from '@/hooks/use-admin';
import { useMe } from '@/hooks/use-me';
import { useRemoveMember } from '@/hooks/use-roster';
import { isForbidden } from '@/lib/api';
import { ADMIN_COPY } from './labels';
import { AuditList } from '@/features/roster/components/AuditList';

function membershipNode(membership: MemberSummary['membership']) {
  if (!membership) return <Pill tone="muted">Membership unknown</Pill>;
  return membership.isMember ? (
    <Pill tone="success">In channel</Pill>
  ) : (
    <Pill tone="destructive">Not in channel</Pill>
  );
}

/** Member directory + roster/channel mismatches (admin only). */
export default function AdminMembersScreen() {
  const members = useMembers();
  const me = useMe();
  const remove = useRemoveMember();
  const [target, setTarget] = useState<MemberSummary | null>(null);
  const [queued, setQueued] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const rows = members.data ?? [];
  const myId = me.data?.user.id;

  const confirmRemoval = () => {
    if (!target) return;
    setError(null);
    remove.mutate(
      { userId: target.user.id },
      {
        onSuccess: () => {
          setQueued((prev) => [...prev, target.user.id]);
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
    <Tabs defaultValue="members">
      <TabsList>
        <TabsTrigger value="members">{ADMIN_COPY.membersTabMembers}</TabsTrigger>
        <TabsTrigger value="mismatches">{ADMIN_COPY.membersTabMismatches}</TabsTrigger>
      </TabsList>

      <TabsContent value="members" className="mt-4">
        {error ? (
          <Alert variant="destructive" className="mb-3">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <ListState
          isLoading={members.isLoading}
          isError={members.isError}
          onRetry={() => void members.refetch()}
          isEmpty={rows.length === 0}
          empty={
            <EmptyState
              title="No members yet"
              description="Joined members will appear here with their roster status."
            />
          }
        >
          <ul className="space-y-3">
            {rows.map((member) => {
              const isSelf = member.user.id === myId;
              const isQueued = queued.includes(member.user.id);
              return (
                <li key={member.user.id}>
                  <Card className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="truncate text-sm font-semibold">{member.user.fullName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.roster
                            ? `Cohort ${member.roster.cohortYear} · ${member.roster.registrationId}`
                            : 'No roster record'}
                        </p>
                      </div>
                      <RoleBadge role={member.user.role} />
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {member.roster ? <StatusPill status={member.roster.status} /> : null}
                      {membershipNode(member.membership)}
                    </div>

                    {isQueued ? (
                      <p
                        role="status"
                        className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs font-medium text-foreground"
                      >
                        Removal queued
                      </p>
                    ) : (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={isSelf}
                        onClick={() => setTarget(member)}
                        className="w-full"
                      >
                        Remove from channel
                      </Button>
                    )}
                    {isSelf && !isQueued ? (
                      <p className="text-xs text-muted-foreground">You cannot remove yourself.</p>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        </ListState>
      </TabsContent>

      <TabsContent value="mismatches" className="mt-4">
        <AuditList />
      </TabsContent>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title="Remove from channel"
        description="Removal is queued and the bot will remove them on its next run."
        confirmLabel="Queue removal"
        tone="destructive"
        loading={remove.isPending}
        onConfirm={confirmRemoval}
      />
    </Tabs>
  );
}
