import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export function CardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
      </div>
    </Card>
  );
}

/** Default full-screen loading state, used by route guards. */
export function ScreenSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <CardSkeleton />
      <CardSkeleton />
    </div>
  );
}
