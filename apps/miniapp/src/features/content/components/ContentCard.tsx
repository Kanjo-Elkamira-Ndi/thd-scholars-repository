import type { ContentPost } from '@thd/shared';
import { AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ContentDeliveryPill } from '@/components/shared/StatusPill';
import { disciplineLabel, formatLabel } from '../labels';

interface ContentCardProps {
  post: ContentPost;
  /** Delivery state is only meaningful to the post's owner or an admin. */
  showDelivery?: boolean;
  onOpen: () => void;
}

export function ContentCard({ post, showDelivery = false, onOpen }: ContentCardProps) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg text-left">
      <Card className="space-y-2 p-4 transition-colors hover:bg-accent">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-sm font-semibold">{post.title}</p>
          {showDelivery ? <ContentDeliveryPill status={post.deliveryStatus} /> : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {disciplineLabel(post.disciplineTag)} · {formatLabel(post.formatTag)}
          {post.cohortTag ? ` · Cohort ${post.cohortTag}` : ''}
        </p>
        {showDelivery && post.deliveryStatus === 'failed' ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertCircle className="size-3.5" aria-hidden="true" />
            The channel delivery failed. Delete and recreate the post to retry.
          </p>
        ) : null}
      </Card>
    </button>
  );
}
