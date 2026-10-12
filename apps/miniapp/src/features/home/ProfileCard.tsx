import type { Role } from '@thd/shared';
import { RoleBadge } from '@/components/shared/RoleBadge';
import { Card } from '@/components/ui/card';

interface ProfileCardProps {
  name: string;
  handle: string | null;
  role: Role;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function ProfileCard({ name, handle, role }: ProfileCardProps) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
      >
        {initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold leading-tight">{name || 'Scholar'}</p>
        {handle ? (
          <p className="truncate text-xs text-muted-foreground">{handle}</p>
        ) : (
          <p className="truncate text-xs text-muted-foreground">Th.D. Scholars Repository</p>
        )}
      </div>
      <RoleBadge role={role} />
    </Card>
  );
}
