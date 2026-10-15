import type { AuditAction, AuditTargetType } from '@thd/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/shared/EmptyState';
import { FilterBar } from '@/components/shared/FilterBar';
import { FilterSelect } from '@/components/shared/FilterSelect';
import { ListState } from '@/components/shared/ListState';
import { SearchInput } from '@/components/shared/SearchInput';
import { ActivityRow } from '@/components/shared/ActivityRow';
import { useAuditLogs } from '@/hooks/use-admin';
import type { AuditLogQuery } from '@/lib/api';
import { ADMIN_COPY, ALL_ACTIONS, ALL_TARGET_TYPES, auditActionOptions, auditTargetTypeOptions } from './labels';

const PAGE_SIZE = 20;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Paged, filterable privileged-action log (admin only). */
export default function AdminAuditScreen() {
  const [action, setAction] = useState(ALL_ACTIONS);
  const [targetType, setTargetType] = useState(ALL_TARGET_TYPES);
  const [actorUserId, setActorUserId] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const query: AuditLogQuery = {
    page,
    pageSize: PAGE_SIZE,
    ...(action !== ALL_ACTIONS ? { action } : {}),
    ...(targetType !== ALL_TARGET_TYPES ? { targetType } : {}),
    ...(actorUserId ? { actorUserId } : {}),
  };

  const audit = useAuditLogs(query);
  const logs = audit.data?.logs ?? [];
  const total = audit.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetTo = (update: () => void) => {
    update();
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <FilterBar>
        <Select value={action} onValueChange={(value) => resetTo(() => setAction(value))}>
          <SelectTrigger aria-label="Filter by action" className="w-44 shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {auditActionOptions().map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FilterSelect
          label="Filter by target type"
          value={targetType}
          onChange={(event) => resetTo(() => setTargetType(event.target.value))}
          options={auditTargetTypeOptions()}
        />
      </FilterBar>

      <SearchInput
        onChange={(value) => resetTo(() => setActorUserId(UUID_RE.test(value) ? value : undefined))}
        placeholder={ADMIN_COPY.auditSearchPlaceholder}
        aria-label={ADMIN_COPY.auditSearchPlaceholder}
      />

      <ListState
        isLoading={audit.isLoading}
        isError={audit.isError}
        onRetry={() => void audit.refetch()}
        isEmpty={logs.length === 0}
        empty={
          <EmptyState
            title="No audit entries"
            description="Privileged actions will show up here as they happen."
          />
        }
      >
        <Card className="px-4">
          <ul className="divide-y divide-border">
            {logs.map((log) => (
              <ActivityRow
                key={log.id}
                action={log.action as AuditAction}
                actorUserId={log.actorUserId}
                targetType={log.targetType as AuditTargetType}
                createdAt={log.createdAt}
              />
            ))}
          </ul>
        </Card>
      </ListState>

      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || audit.isFetching}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          Previous
        </Button>
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Page {page} of {totalPages} · {total} {total === 1 ? 'entry' : 'entries'}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= totalPages || audit.isFetching}
          onClick={() => setPage((current) => current + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
