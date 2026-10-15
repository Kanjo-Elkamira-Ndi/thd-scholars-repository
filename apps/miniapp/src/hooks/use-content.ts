import type { ContentPost, ContentUpdateInput } from '@thd/shared';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseInfiniteQueryResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import {
  createContent,
  deleteContent,
  getContentPost,
  listContent,
  updateContent,
  uploadContent,
  type ContentListQuery,
  type Paginated,
  type UploadContentFields,
} from '@/lib/api';
import { dashboardKeys } from '@/lib/query-keys';

export const ROOT_KEY = 'content' as const;

export const contentKeys = {
  all: [ROOT_KEY] as const,
  list: (query: ContentListQuery) => [ROOT_KEY, 'list', query] as const,
  detail: (id: string) => [ROOT_KEY, 'detail', id] as const,
};

const ACTIVE_DELIVERY = new Set<ContentPost['deliveryStatus']>(['pending', 'processing']);

export function nextContentPage(lastPage: Paginated<ContentPost>): number | undefined {
  return lastPage.page * lastPage.pageSize < lastPage.total ? lastPage.page + 1 : undefined;
}

/** True while any loaded post is still being delivered by the bot. */
export function hasActiveDelivery(pages: Paginated<ContentPost>[] | undefined): boolean {
  return Boolean(
    pages?.some((page) => page.items.some((post) => ACTIVE_DELIVERY.has(post.deliveryStatus))),
  );
}

/** Poll every 5s only while a visible post is pending/processing and the tab is visible. */
export function contentRefetchInterval(
  pages: Paginated<ContentPost>[] | undefined,
  hidden: boolean,
): number | false {
  if (hidden) return false;
  return hasActiveDelivery(pages) ? 5000 : false;
}

/** Invalidate every content view plus the dashboard. */
export function invalidateContentData(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: contentKeys.all }),
    client.invalidateQueries({ queryKey: dashboardKeys.all }),
  ]);
}

/** Infinite, filterable content list that polls while items are still delivering. */
export function useInfiniteContent(
  query: ContentListQuery = {},
  pageSize = 20,
): UseInfiniteQueryResult<{ pages: Paginated<ContentPost>[]; pageParams: unknown[] }> {
  return useInfiniteQuery({
    queryKey: contentKeys.list(query),
    queryFn: ({ pageParam, signal }) =>
      listContent({ ...query, page: pageParam as number, pageSize }, signal),
    initialPageParam: 1,
    getNextPageParam: nextContentPage,
    refetchInterval: (query) => {
      const visible = typeof document === 'undefined' || !document.hidden;
      return visible && hasActiveDelivery(query.state.data?.pages) ? 5000 : false;
    },
  });
}

/** A single content post by id. */
export function useContentPost(id: string | undefined): UseQueryResult<ContentPost> {
  return useQuery({
    queryKey: contentKeys.detail(id ?? ''),
    queryFn: ({ signal }) => getContentPost(id as string, signal),
    enabled: Boolean(id),
  });
}

/** Create a post from a Drive link. */
export function useCreateContent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createContent>[0]) => createContent(input),
    onSuccess: () => invalidateContentData(client),
  });
}

export interface UploadContentVariables {
  fields: UploadContentFields;
  file: File;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** Create a post by uploading a file, with progress reporting. */
export function useUploadContent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ fields, file, onProgress, signal }: UploadContentVariables) =>
      uploadContent(fields, file, { onProgress, signal }),
    onSuccess: () => invalidateContentData(client),
  });
}

/** Update a post's metadata. */
export function useUpdateContent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: ContentUpdateInput }) =>
      updateContent(id, patch),
    onSuccess: (post) => {
      client.setQueryData(contentKeys.detail(post.id), post);
      return invalidateContentData(client);
    },
  });
}

/** Delete a post (hard for fresh posts, soft otherwise). */
export function useDeleteContent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteContent(id),
    onSuccess: (_result, id) => {
      client.removeQueries({ queryKey: contentKeys.detail(id) });
      return invalidateContentData(client);
    },
  });
}
