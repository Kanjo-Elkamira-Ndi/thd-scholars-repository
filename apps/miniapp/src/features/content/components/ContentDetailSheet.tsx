import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { CardSkeleton } from '@/components/shared/LoadingSkeletons';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { ContentDeliveryPill } from '@/components/shared/StatusPill';
import { useBackButton } from '@/hooks/use-back-button';
import { useContentPost, useDeleteContent } from '@/hooks/use-content';
import { useMe } from '@/hooks/use-me';
import { disciplineLabel, formatLabel } from '../labels';
import { ContentLinkActions } from './ContentLinkActions';

interface ContentDetailSheetProps {
  postId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Bottom sheet with a post's details, links, and (gated) edit/delete actions. */
export function ContentDetailSheet({ postId, open, onOpenChange }: ContentDetailSheetProps) {
  const { data: post, isLoading, isError, refetch } = useContentPost(postId ?? undefined);
  const me = useMe();
  const remove = useDeleteContent();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  useBackButton(open, () => onOpenChange(false));

  const canManage =
    Boolean(post) && (me.data?.user.role === 'admin' || me.data?.user.id === post?.postedBy);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>{post?.title ?? 'Library entry'}</SheetTitle>
          <SheetDescription>
            {post
              ? `${disciplineLabel(post.disciplineTag)} · ${formatLabel(post.formatTag)}`
              : 'Post details'}
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <CardSkeleton />
        ) : isError || !post ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-4">
            <Card className="grid grid-cols-2 gap-3 p-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Discipline</dt>
                <dd className="mt-1">{disciplineLabel(post.disciplineTag)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Format</dt>
                <dd className="mt-1">{formatLabel(post.formatTag)}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="mt-1">
                  <ContentDeliveryPill status={post.deliveryStatus} />
                </dd>
              </div>
            </Card>

            <ContentLinkActions post={post} />

            {canManage ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => navigate(`/content/${post.id}/edit`)}
                >
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  className="flex-1"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </SheetContent>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete post"
        description="This removes the post from the library and deletes its message from the channel."
        confirmLabel="Delete"
        tone="destructive"
        loading={remove.isPending}
        onConfirm={() => {
          if (!post) return;
          remove.mutate(post.id, {
            onSuccess: () => {
              setConfirmOpen(false);
              onOpenChange(false);
            },
          });
        }}
      />
    </Sheet>
  );
}
