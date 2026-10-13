import { useState } from 'react';
import { LoadMore } from '@/components/shared/LoadMore';
import { ListState } from '@/components/shared/ListState';
import { PageTransition } from '@/components/shared/PageTransition';
import { useInfiniteContent } from '@/hooks/use-content';
import { useMe } from '@/hooks/use-me';
import { ContentCard } from './components/ContentCard';
import { ContentDetailSheet } from './components/ContentDetailSheet';
import { ContentFilters, type ContentFilterValue } from './components/ContentFilters';

export default function ContentScreen() {
  const [filters, setFilters] = useState<ContentFilterValue>({});
  const [activeId, setActiveId] = useState<string | null>(null);
  const me = useMe();

  const query = useInfiniteContent({
    search: filters.search,
    discipline: filters.disciplineTag,
    format: filters.formatTag,
    cohortYear: filters.cohortYear,
  });

  const posts = query.data?.pages.flatMap((page) => page.items) ?? [];
  const canSeeDelivery = me.data?.user.role === 'admin';

  return (
    <PageTransition className="space-y-4">
      <ContentFilters value={filters} onChange={setFilters} />

      <ListState
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => void query.refetch()}
        isEmpty={posts.length === 0}
        empty={
          <p className="rounded-lg border border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
            No posts match these filters yet.
          </p>
        }
      >
        <div className="space-y-3">
          {posts.map((post) => (
            <ContentCard
              key={post.id}
              post={post}
              showDelivery={canSeeDelivery || me.data?.user.id === post.postedBy}
              onOpen={() => setActiveId(post.id)}
            />
          ))}
        </div>
      </ListState>

      {query.hasNextPage ? (
        <LoadMore
          className="mt-3"
          onLoadMore={() => void query.fetchNextPage()}
          loading={query.isFetchingNextPage}
        />
      ) : null}

      <ContentDetailSheet
        postId={activeId}
        open={activeId !== null}
        onOpenChange={(open) => {
          if (!open) setActiveId(null);
        }}
      />
    </PageTransition>
  );
}
