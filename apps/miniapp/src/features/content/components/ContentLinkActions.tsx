import type { ContentPost } from '@thd/shared';
import { ExternalLink, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildChannelUrl, channelIdFromEnv } from '@/lib/channel-link';
import { openChannelLink, openExternalLink } from '@/lib/telegram-actions';

interface ContentLinkActionsProps {
  post: Pick<ContentPost, 'driveLink' | 'telegramMessageId'>;
}

/** Channel + Drive links for a post. Never opens a new browser tab directly. */
export function ContentLinkActions({ post }: ContentLinkActionsProps) {
  const channelUrl =
    post.telegramMessageId !== null
      ? buildChannelUrl(channelIdFromEnv(), post.telegramMessageId)
      : null;

  if (!channelUrl && !post.driveLink) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {channelUrl ? (
        <Button type="button" variant="secondary" onClick={() => openChannelLink(channelUrl)}>
          <Send aria-hidden="true" />
          Open in channel
        </Button>
      ) : null}
      {post.driveLink ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => openExternalLink(post.driveLink as string)}
        >
          <ExternalLink aria-hidden="true" />
          Open Drive link
        </Button>
      ) : null}
    </div>
  );
}
