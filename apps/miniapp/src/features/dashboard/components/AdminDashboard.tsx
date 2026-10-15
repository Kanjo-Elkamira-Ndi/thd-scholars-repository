import type { AdminDashboard as AdminDashboardData } from '@thd/shared';
import { Activity, GraduationCap, Inbox, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { ActivityRow } from '@/components/shared/ActivityRow';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatCard } from '@/components/shared/StatCard';
import { disciplineLabel } from '@/features/content/labels';
import { DASHBOARD_COPY } from '../labels';

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const maxCount = Math.max(1, ...data.contentByDiscipline.map((row) => row.count));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Active scholars"
          value={data.totalScholars}
          icon={GraduationCap}
          to="/roster"
        />
        <StatCard
          label="Pending requests"
          hint="Last 30 days"
          value={data.pendingJoinRequests}
          icon={Inbox}
        />
        <StatCard
          label="Pending access reviews"
          value={data.pendingAccessReviews}
          icon={ShieldCheck}
          tone={data.pendingAccessReviews > 0 ? 'warning' : 'default'}
          to="/roster?tab=access-review"
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{DASHBOARD_COPY.contentByDiscipline}</h2>
        {data.contentByDiscipline.length === 0 ? (
          <EmptyState title={DASHBOARD_COPY.noDiscipline} />
        ) : (
          <ul className="space-y-2.5">
            {data.contentByDiscipline.map((row) => (
              <li key={row.discipline}>
                <Link
                  to={`/content?discipline=${row.discipline}`}
                  className="block min-h-11 rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium">{disciplineLabel(row.discipline)}</span>
                    <span className="tabular-nums text-muted-foreground">{row.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${(row.count / maxCount) * 100}%` }}
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Activity className="size-4 text-muted-foreground" aria-hidden="true" />
          {DASHBOARD_COPY.recentActivity}
        </h2>
        {data.recentActivity.length === 0 ? (
          <EmptyState
            title={DASHBOARD_COPY.noActivity}
            description={DASHBOARD_COPY.noActivityDescription}
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card px-4">
            {data.recentActivity.map((item) => (
              <ActivityRow
                key={`${item.createdAt}-${item.action}-${item.actorUserId ?? 'system'}`}
                action={item.action}
                actorUserId={item.actorUserId}
                targetType={item.targetType}
                createdAt={item.createdAt}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
