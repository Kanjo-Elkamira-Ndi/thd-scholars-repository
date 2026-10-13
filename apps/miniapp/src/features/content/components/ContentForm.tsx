import type { ContentFormat, ContentPost, DisciplineTag } from '@thd/shared';
import {
  CONTENT_FORMATS,
  DISCIPLINE_TAGS,
  contentCreateSchema,
  contentUpdateSchema,
  driveLinkSchema,
} from '@thd/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { Form } from '@/components/ui/form';
import { validateSelection, validateUploadFile } from '../upload-validation';
import { DriveOrFileField } from './DriveOrFileField';

export interface ContentFormValues {
  title: string;
  disciplineTag: DisciplineTag;
  formatTag: ContentFormat;
  cohortYear?: number;
  file?: File | null;
  driveLink?: string;
}

interface ContentFormProps {
  mode: 'create' | 'edit';
  initial?: ContentPost;
  onSubmit: (values: ContentFormValues) => void;
  busy?: boolean;
  /** 0–100 while a file is uploading (null when idle). */
  progress?: number | null;
  onCancelUpload?: () => void;
  errorMessage?: string | null;
}

const DISCIPLINE_OPTIONS = DISCIPLINE_TAGS.map((tag) => ({ value: tag, label: tag }));
const FORMAT_OPTIONS = CONTENT_FORMATS.map((tag) => ({ value: tag, label: tag }));

interface ContentFormFields {
  title: string;
  disciplineTag: DisciplineTag;
  formatTag: ContentFormat;
  cohortYear?: number;
}

/**
 * Metadata + source form shared by the create and edit flows.
 *
 * Create validates the file/Drive-link choice and the upload's type/size before
 * the parent starts a request; edit is metadata-only (the channel post is not
 * re-sent).
 */
export function ContentForm({
  mode,
  initial,
  onSubmit,
  busy = false,
  progress = null,
  onCancelUpload,
  errorMessage,
}: ContentFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [driveLink, setDriveLink] = useState('');
  const [sourceError, setSourceError] = useState<string | null>(null);

  const isEdit = mode === 'edit';

  const resolver = zodResolver(isEdit ? contentUpdateSchema : contentCreateSchema) as unknown as Resolver<ContentFormFields>;
  const form = useForm<ContentFormFields>({
    resolver,
    mode: 'onBlur',
    defaultValues: {
      title: initial?.title ?? '',
      disciplineTag: (initial?.disciplineTag ?? 'SystematicTheology') as DisciplineTag,
      formatTag: (initial?.formatTag ?? 'audio_lecture') as ContentFormat,
      cohortYear: initial?.cohortTag ?? undefined,
    },
  });

  const formatTag = useWatch({ control: form.control, name: 'formatTag' });

  const submit = form.handleSubmit((values) => {
    if (isEdit) {
      onSubmit({
        title: values.title,
        disciplineTag: values.disciplineTag,
        formatTag: values.formatTag,
        cohortYear: values.cohortYear ?? undefined,
        file: null,
        driveLink: undefined,
      });
      return;
    }

    const selectionError = validateSelection({ file, driveLink });
    if (selectionError) {
      setSourceError(selectionError);
      return;
    }

    if (file) {
      const uploadError = validateUploadFile(file, values.formatTag);
      if (uploadError) {
        setSourceError(uploadError);
        return;
      }
    } else {
      const parsed = driveLinkSchema.safeParse(driveLink);
      if (!parsed.success) {
        setSourceError(parsed.error.issues[0]?.message ?? 'Enter a valid Drive link.');
        return;
      }
    }

    setSourceError(null);
    onSubmit({
      title: values.title,
      disciplineTag: values.disciplineTag,
      formatTag: values.formatTag,
      cohortYear: values.cohortYear ?? undefined,
      file,
      driveLink: file ? undefined : driveLink,
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={submit} className="space-y-4 pb-28" noValidate>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Title</span>
          <input
            aria-label="Title"
            {...form.register('title')}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {form.formState.errors.title ? (
            <span className="block text-sm text-destructive">
              {form.formState.errors.title.message}
            </span>
          ) : null}
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">Discipline</span>
            <select
              aria-label="Discipline"
              {...form.register('disciplineTag')}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {DISCIPLINE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium">Format</span>
            <select
              aria-label="Format"
              {...form.register('formatTag')}
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.value}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-sm font-medium">Cohort year</span>
          <input
            aria-label="Cohort year"
            type="number"
            inputMode="numeric"
            {...form.register('cohortYear', {
              setValueAs: (value) => (value === '' ? undefined : Number(value)),
            })}
            className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="block text-xs text-muted-foreground">Optional.</span>
        </label>

        {isEdit ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Edits update the library listing only; the message already in the channel is unchanged.
          </p>
        ) : (
          <DriveOrFileField
            formatTag={formatTag}
            file={file}
            onFileChange={setFile}
            driveLink={driveLink}
            onDriveLinkChange={setDriveLink}
            error={sourceError ?? undefined}
          />
        )}

        {progress !== null ? (
          <div className="space-y-2">
            <div
              role="progressbar"
              aria-label="Upload progress"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full overflow-hidden rounded-full bg-secondary"
            >
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
            {onCancelUpload ? (
              <button
                type="button"
                onClick={onCancelUpload}
                className="text-sm font-medium text-destructive underline"
              >
                Cancel upload
              </button>
            ) : null}
          </div>
        ) : null}

        {errorMessage ? (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        <div className="sticky bottom-4 z-10 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
          {busy ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              {progress !== null ? 'Uploading…' : 'Saving…'}
            </>
          ) : isEdit ? (
            'Save changes'
          ) : (
            'Publish post'
          )}
          </button>
        </div>
      </form>
    </Form>
  );
}
