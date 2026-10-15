import type { ContentDeliveryStatus, DisciplineTag } from '@thd/shared';
import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { LoadMore } from '@/components/shared/LoadMore';
import { ListState } from '@/components/shared/ListState';
import { PageTransition } from '@/components/shared/PageTransition';
import { useInfiniteContent } from '@/hooks/use-content';
import { useMe } from '@/hooks/use-me';
import { ContentCard } from './components/ContentCard';
import { ContentDetailSheet } from './components/ContentDetailSheet';
import { ContentFilters, type ContentFilterValue } from './components/ContentFilters';

const DELIVERY_STATUSES: ContentDeliveryStatus[] = ['pending', 'processing', 'posted', 'failed'];

/** Seed the filter panel from deep links (`?mine`, `?deliveryStatus`, `?discipline`, `?search`). */
function seedFilters(params: URLSearchParams): ContentFilterValue {
  const delivery = params.get('deliveryStatus');
  return {
    search: params.get('search') ?? undefined,
    disciplineTag: (params.get('discipline') as DisciplineTag | null) ?? undefined,
    mine: params.get('mine') === 'true' ? true : undefined,
    deliveryStatus:
      delivery && DELIVERY_STATUSES.includes(delivery as ContentDeliveryStatus)
        ? (delivery as ContentDeliveryStatus)
        : undefined,
  };
}

function filtersToParams(filters: ContentFilterValue): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search) params.set('search', filters.search);
  if (filters.disciplineTag) params.set('discipline', filters.disciplineTag);
  if (filters.formatTag) params.set('format', filters.formatTag);
  if (filters.cohortYear) params.set('cohortYear', String(filters.cohortYear));
  if (filters.mine) params.set('mine', 'true');
  if (filters.deliveryStatus) params.set('deliveryStatus', filters.deliveryStatus);
  return params;
}

export default function ContentScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { id: routeId } = useParams();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ContentFilterValue>(() => seedFilters(searchParams));
  const [sheetId, setSheetId] = useState<string | null>(null);
  const me = useMe();

  const query = useInfiniteContent({
    search: filters.search,
    discipline: filters.disciplineTag,
    format: filters.formatTag,
    cohortYear: filters.cohortYear,
    mine: filters.mine,
    deliveryStatus: filters.deliveryStatus,
  });

  const posts = query.data?.pages.flatMap((page) => page.items) ?? [];
  const role = me.data?.user.role;
  const canSeeDelivery = role === 'admin';

  const applyFilters = (next: ContentFilterValue) => {
    setFilters(next);
    setSearchParams(filtersToParams(next), { replace: true });
  };

  const activeId = routeId ?? sheetId;

  const closeDetail = () => {
    if (routeId) navigate('/content', { replace: true });
    else setSheetId(null);
  };

  return (
    <PageTransition className="space-y-4">
      <ContentFilters
        value={filters}
        onChange={applyFilters}
        showAuthorFilters={role === 'faculty' || role === 'admin'}
      />

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
              onOpen={() => setSheetId(post.id)}
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
          if (!open) closeDetail();
        }}
      />
    </PageTransition>
  );
}
