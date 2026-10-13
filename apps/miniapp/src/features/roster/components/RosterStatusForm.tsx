import type { RosterEntry, RosterStatus, RosterUpdateInput } from '@thd/shared';
import { rosterUpdateSchema } from '@thd/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useUpdateRoster } from '@/hooks/use-roster';

const STATUS_OPTIONS: { value: RosterStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'pending', label: 'Pending' },
];

const FLAG_STATUSES: RosterStatus[] = ['graduated', 'withdrawn'];

interface RosterStatusFormProps {
  entry: RosterEntry;
  onSaved?: () => void;
}

export function RosterStatusForm({ entry, onSaved }: RosterStatusFormProps) {
  const update = useUpdateRoster();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingPatch, setPendingPatch] = useState<RosterUpdateInput | null>(null);

  const form = useForm<RosterUpdateInput>({
    resolver: zodResolver(rosterUpdateSchema),
    mode: 'onTouched',
    defaultValues: {
      status: entry.status,
      cohortYear: entry.cohortYear,
      programTrack: entry.programTrack,
      supervisorName: entry.supervisorName ?? undefined,
    },
  });

  const selectedStatus = useWatch({ control: form.control, name: 'status' });

  const commit = (patch: RosterUpdateInput) => {
    update.mutate(
      { id: entry.id, patch },
      { onSuccess: () => onSaved?.() },
    );
  };

  const onSubmit = form.handleSubmit((values) => {
    const patch: RosterUpdateInput = {
      status: values.status,
      cohortYear: values.cohortYear,
      programTrack: values.programTrack,
      ...(values.supervisorName ? { supervisorName: values.supervisorName } : {}),
    };

    const flags = FLAG_STATUSES.includes(values.status ?? 'active');
    if (flags && values.status !== entry.status) {
      setPendingPatch(patch);
      setConfirmOpen(true);
      return;
    }
    commit(patch);
  });

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Status</FormLabel>
              <FormControl>
                <select
                  aria-label="Status"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {STATUS_OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {selectedStatus === 'active' && entry.accessReviewPending ? (
          <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            This cancels any pending removal and keeps the scholar in the channel.
          </p>
        ) : null}

        <FormField
          control={form.control}
          name="cohortYear"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Cohort year</FormLabel>
              <FormControl>
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="Cohort year"
                  value={field.value ?? ''}
                  onChange={(event) =>
                    field.onChange(event.target.value === '' ? undefined : Number(event.target.value))
                  }
                  onBlur={field.onBlur}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="programTrack"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Program track</FormLabel>
              <FormControl>
                <input
                  aria-label="Program track"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="supervisorName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Supervisor</FormLabel>
              <FormControl>
                <input
                  aria-label="Supervisor"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </FormControl>
              <FormDescription>Optional.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        {update.isError ? (
          <Alert variant="destructive">
            <AlertDescription>
              Could not update this scholar. Please try again.
            </AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="w-full" disabled={update.isPending}>
          {update.isPending ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          setConfirmOpen(open);
          if (!open) setPendingPatch(null);
        }}
        title="Flag for access review"
        description="This will flag the scholar for access review. They stay in the channel until an admin or the flagging registrar confirms removal."
        confirmLabel="Flag for review"
        tone="destructive"
        loading={update.isPending}
        onConfirm={() => {
          if (pendingPatch) commit(pendingPatch);
          setConfirmOpen(false);
          setPendingPatch(null);
        }}
      />
    </Form>
  );
}
