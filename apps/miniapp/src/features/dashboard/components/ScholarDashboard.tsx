import type { ScholarDashboard as ScholarDashboardData } from '@thd/shared';
import { UserRound } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusPill } from '@/components/shared/StatusPill';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DASHBOARD_COPY, scholarStatusNote } from '../labels';
import { RecentContentList } from './RecentContentList';

export function ScholarDashboard({ data }: { data: ScholarDashboardData }) {
  const { roster, recentContent } = data;

  if (!roster) {
    return (
      <EmptyState
        icon={UserRound}
        title="Your registration is not linked yet"
        description="Finish registration and the registrar will match your Telegram account to the roster."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <CardTitle>{DASHBOARD_COPY.rosterStanding}</CardTitle>
          <StatusPill status={roster.status} />
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{DASHBOARD_COPY.registrationId}</span>
            <span className="font-mono font-medium">{roster.registrationId}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">{DASHBOARD_COPY.cohort}</span>
            <span className="font-medium">{roster.cohortYear}</span>
          </div>
        </CardContent>
      </Card>

      {roster.status === 'active' ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">{DASHBOARD_COPY.recentContent}</h2>
          <RecentContentList posts={recentContent} />
        </section>
      ) : (
        <EmptyState
          title={scholarStatusNote(roster.status).title}
          description={scholarStatusNote(roster.status).description}
        />
      )}
    </div>
  );
}
