import type { DashboardPayload } from '@thd/shared';
import { ErrorState } from '@/components/shared/ErrorState';
import { CardSkeleton } from '@/components/shared/LoadingSkeletons';
import { useDashboard } from '@/hooks/use-dashboard';
import { AdminDashboard } from './components/AdminDashboard';
import { FacultyDashboard } from './components/FacultyDashboard';
import { RegistrarDashboard } from './components/RegistrarDashboard';
import { ScholarDashboard } from './components/ScholarDashboard';

function DashboardPanel({ data }: { data: DashboardPayload }) {
  switch (data.role) {
    case 'scholar':
      return <ScholarDashboard data={data} />;
    case 'faculty':
      return <FacultyDashboard data={data} />;
    case 'registrar':
      return <RegistrarDashboard data={data} />;
    case 'admin':
      return <AdminDashboard data={data} />;
  }
}

/** The role-aware dashboard body rendered inside the Home screen. */
export function DashboardScreen() {
  const { data, isPending, isError, refetch } = useDashboard();

  if (isPending) {
    return (
      <div className="space-y-4">
        <CardSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <ErrorState
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return <DashboardPanel data={data} />;
}
