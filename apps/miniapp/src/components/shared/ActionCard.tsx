import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@/components/ui/card';

interface ActionCardProps {
  to: string;
  title: string;
  description?: string;
  icon?: LucideIcon;
}

/** A large, description-led link card for hub-style navigation. */
export function ActionCard({ to, title, description, icon: Icon }: ActionCardProps) {
  return (
    <Link
      to={to}
      className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="flex min-h-16 items-center gap-3 p-4 transition-colors hover:bg-accent">
        {Icon ? (
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="size-5" aria-hidden="true" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{title}</p>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Card>
    </Link>
  );
}
