import { Construction } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageTransition } from '@/components/shared/PageTransition';

interface PlaceholderScreenProps {
  title: string;
  description?: string;
}

export function PlaceholderScreen({ title, description }: PlaceholderScreenProps) {
  return (
    <PageTransition className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">Coming soon</p>
      </div>
      <EmptyState
        icon={Construction}
        title={`${title} is on the way`}
        description={
          description ?? 'This section is designed and will be wired up in a later phase.'
        }
      />
    </PageTransition>
  );
}
