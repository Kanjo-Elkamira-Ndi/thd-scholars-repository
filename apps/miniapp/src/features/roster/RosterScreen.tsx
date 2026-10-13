import { useState } from 'react';
import { EmptyState } from '@/components/shared/EmptyState';
import { ListState } from '@/components/shared/ListState';
import { LoadMore } from '@/components/shared/LoadMore';
import { PageTransition } from '@/components/shared/PageTransition';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useInfiniteRoster } from '@/hooks/use-roster';
import { AccessReviewList } from './components/AccessReviewList';
import { AuditList } from './components/AuditList';
import { RosterCard } from './components/RosterCard';
import { RosterDetailSheet } from './components/RosterDetailSheet';
import { RosterFilters, type RosterFilterValue } from './components/RosterFilters';

function ScholarsSegment() {
  const [filters, setFilters] = useState<RosterFilterValue>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useInfiniteRoster(filters);
  const entries = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      <div className="space-y-3">
        <RosterFilters value={filters} onChange={setFilters} />

        <ListState
          isLoading={list.isLoading}
          isError={list.isError}
          onRetry={() => void list.refetch()}
          isEmpty={entries.length === 0}
          empty={
            <EmptyState
              title="No scholars match"
              description="Try a different search or clear the filters."
            />
          }
        >
          <ul className="space-y-3">
            {entries.map((entry) => (
              <li key={entry.id}>
                <RosterCard entry={entry} onOpen={() => setSelectedId(entry.id)} />
              </li>
            ))}
          </ul>

          {list.hasNextPage ? (
            <LoadMore
              className="mt-3"
              onLoadMore={() => void list.fetchNextPage()}
              loading={list.isFetchingNextPage}
            />
          ) : null}
        </ListState>
      </div>

      <RosterDetailSheet
        rosterId={selectedId}
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      />
    </>
  );
}

export default function RosterScreen() {
  return (
    <PageTransition>
      <Tabs defaultValue="scholars">
        <TabsList>
          <TabsTrigger value="scholars">Scholars</TabsTrigger>
          <TabsTrigger value="review">Access review</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="scholars">
          <ScholarsSegment />
        </TabsContent>
        <TabsContent value="review">
          <AccessReviewList />
        </TabsContent>
        <TabsContent value="audit">
          <AuditList />
        </TabsContent>
      </Tabs>
    </PageTransition>
  );
}
