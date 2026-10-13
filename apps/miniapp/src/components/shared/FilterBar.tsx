import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface FilterBarProps {
  children: ReactNode;
  /** Optional trailing action (e.g. a "Clear filters" button). */
  action?: ReactNode;
  className?: string;
}

/** Horizontal, scrollable row of filter controls. */
export function FilterBar({ children, action, className }: FilterBarProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        role="group"
        aria-label="Filters"
        className="-mx-4 flex flex-1 gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {action}
    </div>
  );
}
