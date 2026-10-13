import type { ContentFormat } from '@thd/shared';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ACCEPT_ATTRIBUTE } from '../upload-validation';

interface DriveOrFileFieldProps {
  formatTag: ContentFormat;
  file: File | null;
  onFileChange: (file: File | null) => void;
  driveLink: string;
  onDriveLinkChange: (value: string) => void;
  /** Inline message (either/neither, wrong type, oversize). */
  error?: string;
}

type Mode = 'file' | 'link';

/**
 * The composer's source picker: upload a file **or** paste a Drive link, never
 * both. Owns only the input UI; the parent keeps the selected values.
 */
export function DriveOrFileField({
  formatTag,
  file,
  onFileChange,
  driveLink,
  onDriveLinkChange,
  error,
}: DriveOrFileFieldProps) {
  const [mode, setMode] = useState<Mode>('file');
  const fileInputId = useId();

  const selectFile = () => {
    setMode('file');
    onDriveLinkChange('');
  };

  const selectLink = () => {
    setMode('link');
    onFileChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'file' ? 'default' : 'secondary'}
          className="flex-1"
          onClick={selectFile}
        >
          Upload file
        </Button>
        <Button
          type="button"
          variant={mode === 'link' ? 'default' : 'secondary'}
          className="flex-1"
          onClick={selectLink}
        >
          Drive link
        </Button>
      </div>

      {mode === 'file' ? (
        <div className="space-y-1">
          <label htmlFor={fileInputId} className="text-sm font-medium">
            File
          </label>
          <input
            id={fileInputId}
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            aria-label={`Upload ${formatTag} file`}
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            className={cn(
              'block w-full rounded-md border border-input bg-background text-sm',
              'file:mr-3 file:border-0 file:bg-secondary file:px-3 file:py-2.5 file:text-secondary-foreground',
            )}
          />
          {file ? <p className="text-xs text-muted-foreground">Selected: {file.name}</p> : null}
        </div>
      ) : (
        <div className="space-y-1">
          <label htmlFor={`${fileInputId}-link`} className="text-sm font-medium">
            Drive link
          </label>
          <input
            id={`${fileInputId}-link`}
            type="url"
            inputMode="url"
            aria-label="Drive link"
            placeholder="https://drive.google.com/…"
            value={driveLink}
            onChange={(event) => onDriveLinkChange(event.target.value)}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
