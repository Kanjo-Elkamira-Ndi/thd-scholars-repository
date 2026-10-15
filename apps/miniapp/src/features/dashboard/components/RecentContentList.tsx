import type { ContentPost } from '@thd/shared';
import { Link } from 'react-router';
import { EmptyState } from '@/components/shared/EmptyState';
import { formatRelativeTime } from '@/lib/audit-labels';
import { DASHBOARD_COPY } from '../labels';

interface RecentContentListProps {
  posts: ContentPost[];
  emptyTitle?: string;
  emptyDescription?: string;
}

/** Compact list of the newest posts, each linking to its content detail route. */
export function RecentContentList({
  posts,
  emptyTitle = DASHBOARD_COPY.noContentYet,
  emptyDescription = DASHBOARD_COPY.noContentYetDescription,
}: RecentContentListProps) {
  if (posts.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {posts.map((post) => (
        <li key={post.id}>
          <Link
            to={`/content/${post.id}`}
            className="flex min-h-11 items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0 truncate text-sm font-medium">{post.title}</span>
            <time
              dateTime={post.createdAt}
              title={new Date(post.createdAt).toLocaleString()}
              className="shrink-0 text-xs text-muted-foreground"
            >
              {formatRelativeTime(post.createdAt)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
