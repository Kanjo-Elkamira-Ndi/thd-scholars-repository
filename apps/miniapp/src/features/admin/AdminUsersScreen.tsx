import type { Role, User } from '@thd/shared';
import { useMemo, useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { ListState } from '@/components/shared/ListState';
import { RoleBadge, roleLabel } from '@/components/shared/RoleBadge';
import { SearchInput } from '@/components/shared/SearchInput';
import { useUsers, useUpdateUserRole } from '@/hooks/use-admin';
import { useMe } from '@/hooks/use-me';
import { isForbidden } from '@/lib/api';
import { ADMIN_COPY } from './labels';

const ROLES: Role[] = ['scholar', 'faculty', 'registrar', 'admin'];

interface PendingChange {
  user: User;
  role: Role;
}

function formatJoined(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? 'Joined date unknown' : `Joined ${date.toLocaleDateString()}`;
}

/** Account directory with role changes (admin only). */
export default function AdminUsersScreen() {
  const users = useUsers();
  const me = useMe();
  const updateRole = useUpdateUserRole();
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState<PendingChange | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo(() => users.data ?? [], [users.data]);
  const myId = me.data?.user.id;
  const adminCount = rows.filter((user) => user.role === 'admin').length;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((user) =>
      [user.fullName, user.telegramUsername ?? '', user.role].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [rows, search]);

  const guard = (user: User): string | null => {
    if (user.id === myId) return 'You cannot change your own role.';
    if (user.role === 'admin' && adminCount <= 1) return 'At least one admin must remain.';
    return null;
  };

  const confirmChange = () => {
    if (!pending) return;
    setNotice(null);
    setError(null);
    updateRole.mutate(
      { id: pending.user.id, role: pending.role },
      {
        onSuccess: () => {
          setNotice(`Changed ${pending.user.fullName} to ${roleLabel(pending.role)}.`);
          setPending(null);
        },
        onError: (err) => {
          setPending(null);
          setError(
            isForbidden(err)
              ? 'You do not have permission to change roles.'
              : 'Could not change the role. Please try again.',
          );
        },
      },
    );
  };

  return (
    <div className="space-y-3">
      <SearchInput
        onChange={setSearch}
        placeholder={ADMIN_COPY.usersSearchPlaceholder}
        aria-label={ADMIN_COPY.usersSearchPlaceholder}
      />

      {notice ? (
        <Alert role="status">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <ListState
        isLoading={users.isLoading}
        isError={users.isError}
        onRetry={() => void users.refetch()}
        isEmpty={filtered.length === 0}
        empty={
          <EmptyState
            title="No accounts found"
            description="Try a different search, or wait for members to join."
          />
        }
      >
        <ul className="space-y-3">
          {filtered.map((user) => {
            const blocked = guard(user);
            return (
              <li key={user.id}>
                <Card className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <p className="truncate text-sm font-semibold">{user.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {user.telegramUsername ? `@${user.telegramUsername}` : 'No username'}
                      </p>
                    </div>
                    <RoleBadge role={user.role} />
                  </div>
                  <p className="text-xs text-muted-foreground">{formatJoined(user.createdAt)}</p>

                  <Select
                    value={user.role}
                    disabled={blocked !== null}
                    onValueChange={(value) => setPending({ user, role: value as Role })}
                  >
                    <SelectTrigger aria-label={`Role for ${user.fullName}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {roleLabel(role)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {blocked ? <p className="text-xs text-muted-foreground">{blocked}</p> : null}
                </Card>
              </li>
            );
          })}
        </ul>
      </ListState>

      <ConfirmDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
        title="Change role"
        description={
          pending
            ? `Change ${pending.user.fullName} to ${roleLabel(pending.role)}? This takes effect immediately.`
            : undefined
        }
        confirmLabel="Change role"
        loading={updateRole.isPending}
        onConfirm={confirmChange}
      />
    </div>
  );
}
