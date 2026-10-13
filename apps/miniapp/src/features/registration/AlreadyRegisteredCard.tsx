import type { RosterEntry } from '@thd/shared';
import { CheckCircle2 } from 'lucide-react';
import { StatusPill } from '@/components/shared/StatusPill';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface AlreadyRegisteredCardProps {
  roster: RosterEntry;
  onUpdate: () => void;
}

export function AlreadyRegisteredCard({ roster, onUpdate }: AlreadyRegisteredCardProps) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success" aria-hidden="true" />
          You're registered
        </CardTitle>
        <StatusPill status={roster.status} />
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Registration ID</dt>
            <dd className="font-medium">{roster.registrationId}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Cohort</dt>
            <dd className="font-medium">{roster.cohortYear}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Program track</dt>
            <dd className="font-medium">{roster.programTrack}</dd>
          </div>
        </dl>
        <Button variant="secondary" className="w-full" onClick={onUpdate}>
          Update my details
        </Button>
      </CardContent>
    </Card>
  );
}
