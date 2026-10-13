import { Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface SearchInputProps {
  /** Called with the trimmed query after the debounce settles. */
  onChange: (value: string) => void;
  placeholder?: string;
  delayMs?: number;
  defaultValue?: string;
  className?: string;
  'aria-label'?: string;
}

/**
 * Debounced search field. Keeps the typed text local so typing stays snappy
 * while `onChange` only fires after the user pauses.
 */
export function SearchInput({
  onChange,
  placeholder = 'Search…',
  delayMs = 250,
  defaultValue = '',
  className,
  ...rest
}: SearchInputProps) {
  const [text, setText] = useState(defaultValue);
  const onChangeRef = useRef(onChange);
  const isFirstRun = useRef(true);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const timer = setTimeout(() => onChangeRef.current(text.trim()), delayMs);
    return () => clearTimeout(timer);
  }, [text, delayMs]);

  return (
    <div className={cn('relative', className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={rest['aria-label'] ?? placeholder}
        className="pl-9 pr-10"
      />
      {text ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear search"
          onClick={() => setText('')}
          className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
