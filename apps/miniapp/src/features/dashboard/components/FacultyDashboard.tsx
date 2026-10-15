import type { FacultyDashboard as FacultyDashboardData } from '@thd/shared';
import { AlertCircle, BookOpen } from 'lucide-react';
import { StatCard } from '@/components/shared/StatCard';
import { DASHBOARD_COPY } from '../labels';
import { RecentContentList } from './RecentContentList';

export function FacultyDashboard({ data }: { data: FacultyDashboardData }) {
  const hasFailures = data.failedDeliveries > 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="My posts"
          value={data.myContentCount}
          icon={BookOpen}
          to="/content?mine=true"
        />
        <StatCard
          label="Failed deliveries"
          value={data.failedDeliveries}
          icon={AlertCircle}
          tone={hasFailures ? 'destructive' : 'default'}
          to="/content?mine=true&deliveryStatus=failed"
        />
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{DASHBOARD_COPY.recentContent}</h2>
        <RecentContentList
          posts={data.recentContent}
          emptyTitle="No posts yet"
          emptyDescription="Share a lecture or resource and it will appear here."
        />
      </section>
    </div>
  );
}
