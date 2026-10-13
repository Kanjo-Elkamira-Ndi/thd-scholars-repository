import type { ReactNode } from 'react';
import { CardSkeleton } from '@/components/shared/LoadingSkeletons';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { cn } from '@/lib/utils';

interface ListStateProps {
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  isEmpty: boolean;
  /** Shown while the first page loads. Defaults to a stack of card skeletons. */
  skeleton?: ReactNode;
  /** Shown when the query succeeded but returned no rows. */
  empty?: ReactNode;
  children: ReactNode;
  className?: string;
}

/**
 * Renders the loading / error / empty / content states for a paginated list so
 * every feature screen handles them consistently.
 */
export function ListState({
  isLoading,
  isError,
  onRetry,
  isEmpty,
  skeleton,
  empty,
  children,
  className,
}: ListStateProps) {
  if (isLoading) {
    return (
      <div className={cn('space-y-3', className)}>
        {skeleton ?? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        )}
      </div>
    );
  }

  if (isError) {
    return <ErrorState onRetry={onRetry} className={className} />;
  }

  if (isEmpty) {
    return (
      <>
        {empty ?? (
          <EmptyState
            title="Nothing here yet"
            description="When there is something to show, it will appear here."
            className={className}
          />
        )}
      </>
    );
  }

  return <div className={className}>{children}</div>;
}
