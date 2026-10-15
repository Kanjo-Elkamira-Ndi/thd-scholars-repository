import type { RegistrarDashboard as RegistrarDashboardData } from '@thd/shared';
import { Flag, GraduationCap, ShieldAlert, ShieldCheck } from 'lucide-react';
import { StatCard } from '@/components/shared/StatCard';

export function RegistrarDashboard({ data }: { data: RegistrarDashboardData }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard label="Active scholars" value={data.totalScholars} icon={GraduationCap} />
      <StatCard
        label="Pending access reviews"
        value={data.pendingAccessReviews}
        icon={ShieldCheck}
        tone={data.pendingAccessReviews > 0 ? 'warning' : 'default'}
        to="/roster?tab=access-review"
      />
      <StatCard
        label="Flagged by me"
        value={data.myPendingAccessReviews}
        icon={Flag}
        to="/roster?tab=access-review"
      />
      <StatCard
        label="Roster mismatches"
        value={data.rosterAuditIssues}
        icon={ShieldAlert}
        tone={data.rosterAuditIssues > 0 ? 'destructive' : 'default'}
        to="/roster?tab=audit"
      />
    </div>
  );
}
