import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface AccessDeniedProps {
  title?: string;
  description?: string;
  className?: string;
}

export function AccessDenied({
  title = 'Not available for your role',
  description = 'This area is limited to other members of the repository. If you think this is a mistake, contact the registrar.',
  className,
}: AccessDeniedProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-border bg-card px-6 py-10 text-center',
        className,
      )}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-warning/15 text-warning">
        <Lock className="size-5" aria-hidden="true" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <Button variant="secondary" asChild>
        <a href="#/">Back to home</a>
      </Button>
    </div>
  );
}
