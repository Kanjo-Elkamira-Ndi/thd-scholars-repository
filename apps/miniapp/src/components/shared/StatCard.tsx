import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StatTone = 'default' | 'warning' | 'destructive' | 'success';

const TONE_CLASS: Record<StatTone, string> = {
  default: 'text-foreground',
  warning: 'text-warning',
  destructive: 'text-destructive',
  success: 'text-success',
};

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: StatTone;
  /** When set, the whole card becomes a deep-link (≥44px target). */
  to?: string;
  className?: string;
}

/** A single dashboard metric, optionally linking to the view that explains it. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
  to,
  className,
}: StatCardProps) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden="true" /> : null}
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      </div>
      <p className={cn('mt-2 text-2xl font-semibold tabular-nums', TONE_CLASS[tone])}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          'block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
      >
        <Card className="relative min-h-11 p-4 transition-colors hover:bg-accent">
          {body}
          <ChevronRight
            className="absolute right-3 top-3 size-4 text-muted-foreground"
            aria-hidden="true"
          />
        </Card>
      </Link>
    );
  }

  return <Card className={cn('p-4', className)}>{body}</Card>;
}
