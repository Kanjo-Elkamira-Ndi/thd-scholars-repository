import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface LoadMoreProps {
  onLoadMore: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  className?: string;
}

/** Explicit "load more" control for paginated lists. */
export function LoadMore({
  onLoadMore,
  loading = false,
  disabled = false,
  label = 'Load more',
  className,
}: LoadMoreProps) {
  return (
    <div className={cn('flex justify-center pt-1', className)}>
      <Button
        type="button"
        variant="outline"
        onClick={onLoadMore}
        disabled={loading || disabled}
        aria-busy={loading}
      >
        {loading ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        {loading ? 'Loading…' : label}
      </Button>
    </div>
  );
}
