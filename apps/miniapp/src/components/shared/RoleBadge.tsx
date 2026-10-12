import type { Role } from '@thd/shared';
import { Badge } from '@/components/ui/badge';

type Tone = 'default' | 'secondary' | 'outline' | 'muted' | 'success' | 'warning' | 'destructive';

const ROLE_LABELS: Record<Role, string> = {
  scholar: 'Scholar',
  faculty: 'Faculty',
  registrar: 'Registrar',
  admin: 'Admin',
};

const ROLE_TONES: Record<Role, Tone> = {
  scholar: 'default',
  faculty: 'success',
  registrar: 'warning',
  admin: 'secondary',
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <Badge variant={ROLE_TONES[role]} className={className}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}
