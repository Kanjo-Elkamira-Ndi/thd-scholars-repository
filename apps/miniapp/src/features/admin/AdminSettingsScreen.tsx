import type { SettingsUpdateInput, SystemSettings } from '@thd/shared';
import { settingsUpdateSchema } from '@thd/shared';
import { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorState } from '@/components/shared/ErrorState';
import { CardSkeleton } from '@/components/shared/LoadingSkeletons';
import { useSettings, useUpdateSettings } from '@/hooks/use-admin';
import { ADMIN_COPY } from './labels';

const MB = 1_048_576;

interface FormState {
  registrationIdPattern: string;
  availableCohortYears: string;
  inviteLinkExpirySeconds: string;
  maxUploadSizeMb: string;
  maxContentUploadMb: string;
}

function parseCohortYears(value: string): number[] {
  return value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => a - b);
}

function buildPatch(form: FormState, current: SystemSettings): SettingsUpdateInput {
  const patch: SettingsUpdateInput = {};
  if (form.registrationIdPattern !== current.registrationIdPattern) {
    patch.registrationIdPattern = form.registrationIdPattern;
  }
  const cohortYears = parseCohortYears(form.availableCohortYears);
  if (cohortYears.join(',') !== current.availableCohortYears.join(',')) {
    patch.availableCohortYears = cohortYears;
  }
  const expiry = Number.parseInt(form.inviteLinkExpirySeconds, 10);
  if (expiry !== current.inviteLinkExpirySeconds) {
    patch.inviteLinkExpirySeconds = expiry;
  }
  const uploadBytes = Math.round(Number(form.maxUploadSizeMb) * MB);
  if (uploadBytes !== current.maxUploadSizeBytes) {
    patch.maxUploadSizeBytes = uploadBytes;
  }
  const contentBytes = Math.round(Number(form.maxContentUploadMb) * MB);
  if (contentBytes !== current.maxContentUploadBytes) {
    patch.maxContentUploadBytes = contentBytes;
  }
  return patch;
}

/** System settings editor; writes only the fields that changed (admin only). */
export default function AdminSettingsScreen() {
  const settings = useSettings();
  const update = useUpdateSettings();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (settings.isLoading) {
    return (
      <div className="space-y-3">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  if (settings.isError || !settings.data) {
    return <ErrorState onRetry={() => void settings.refetch()} />;
  }

  const current = settings.data;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaved(false);
    setError(null);

    const data = new FormData(event.currentTarget);
    const form: FormState = {
      registrationIdPattern: String(data.get('registrationIdPattern') ?? ''),
      availableCohortYears: String(data.get('availableCohortYears') ?? ''),
      inviteLinkExpirySeconds: String(data.get('inviteLinkExpirySeconds') ?? ''),
      maxUploadSizeMb: String(data.get('maxUploadSizeMb') ?? ''),
      maxContentUploadMb: String(data.get('maxContentUploadMb') ?? ''),
    };

    const patch = buildPatch(form, current);
    const parsed = settingsUpdateSchema.safeParse(patch);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check the values and try again.');
      return;
    }

    update.mutate(parsed.data, {
      onSuccess: () => setSaved(true),
      onError: () => setError('Could not save settings. Please try again.'),
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {saved ? (
        <Alert role="status">
          <AlertDescription>{ADMIN_COPY.settingsSaved}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="settings-registration-pattern">Registration ID pattern</Label>
          <Input
            id="settings-registration-pattern"
            name="registrationIdPattern"
            defaultValue={current.registrationIdPattern}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            A regular expression every new registration ID must match.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-cohort-years">Available cohort years</Label>
          <Input
            id="settings-cohort-years"
            name="availableCohortYears"
            defaultValue={current.availableCohortYears.join(', ')}
          />
          <p className="text-xs text-muted-foreground">Comma-separated, e.g. 2023, 2024, 2025.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-invite-expiry">Invite link expiry (seconds)</Label>
          <Input
            id="settings-invite-expiry"
            name="inviteLinkExpirySeconds"
            type="number"
            inputMode="numeric"
            min={300}
            max={2_592_000}
            defaultValue={current.inviteLinkExpirySeconds}
          />
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <div className="space-y-2">
          <Label htmlFor="settings-upload-size">Upload size threshold (MB)</Label>
          <Input
            id="settings-upload-size"
            name="maxUploadSizeMb"
            type="number"
            inputMode="numeric"
            min={1}
            max={50}
            defaultValue={Math.round(current.maxUploadSizeBytes / MB)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="settings-content-upload">Max content upload size (MB)</Label>
          <Input
            id="settings-content-upload"
            name="maxContentUploadMb"
            type="number"
            inputMode="numeric"
            min={1}
            max={2048}
            defaultValue={Math.round(current.maxContentUploadBytes / MB)}
          />
        </div>
      </Card>

      <Button type="submit" disabled={update.isPending} className="w-full">
        {update.isPending ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}
