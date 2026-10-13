import type { SelectHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface FilterSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Accessible name for the control (filters rely on it; there is no visible label). */
  label: string;
  options: { value: string; label: string }[];
}

/**
 * Native `<select>` styled to match the app's inputs.
 *
 * Filters use the native control deliberately: on mobile it opens the OS
 * picker, which is faster and more reliable inside the Telegram WebView than a
 * custom Radix listbox (`@radix-ui/react-select` still backs real dropdowns).
 */
export function FilterSelect({ label, options, className, ...props }: FilterSelectProps) {
  return (
    <select
      aria-label={label}
      className={cn(
        'h-11 shrink-0 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
