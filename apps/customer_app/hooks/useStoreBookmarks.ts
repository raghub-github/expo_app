import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getStoreBookmarks } from "@/services/merchant.service";
import { useAuthStore } from "@/store/authStore";
import {
  readSyncStoreBookmarks,
  writeCachedStoreBookmarks,
} from "@/lib/storeBookmarkCache";

export const STORE_BOOKMARKS_QUERY_KEY = ["store-bookmarks"] as const;

async function fetchStoreBookmarkIds(): Promise<string[]> {
  const remote = await getStoreBookmarks();
  const local = readSyncStoreBookmarks() ?? [];
  // Prefer server when it has rows. If the API is empty, keep local hearts
  // from this device so a failed/missing table does not wipe favorites.
  const ids = remote.length > 0 ? remote : local;
  void writeCachedStoreBookmarks(ids);
  return ids;
}

export function useStoreBookmarks() {
  const session = useAuthStore((s) => s.session);
  const isAuthenticated = Boolean(session?.accessToken);

  const query = useQuery({
    queryKey: STORE_BOOKMARKS_QUERY_KEY,
    queryFn: fetchStoreBookmarkIds,
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
    placeholderData: () => readSyncStoreBookmarks(),
  });

  const bookmarkSet = useMemo(() => new Set(query.data ?? []), [query.data]);

  return {
    bookmarkSet,
    isLoading: query.isLoading,
    isError: query.isError,
    isAuthenticated,
    refetch: query.refetch,
  };
}

export function useStoreBookmarkMutations() {
  const queryClient = useQueryClient();

  const syncBookmark = (storeId: string, saved: boolean) => {
    queryClient.setQueryData<string[]>(STORE_BOOKMARKS_QUERY_KEY, (prev) => {
      const list = prev ?? readSyncStoreBookmarks() ?? [];
      const next = saved
        ? list.includes(storeId)
          ? list
          : [...list, storeId]
        : list.filter((id) => id !== storeId);
      void writeCachedStoreBookmarks(next);
      return next;
    });
  };

  return { syncBookmark };
}

/** Per-store selector — other cards do not re-render when a different bookmark changes. */
export function useIsStoreBookmarked(storeId: string): boolean {
  const session = useAuthStore((s) => s.session);
  const isAuthenticated = Boolean(session?.accessToken);
  const { data } = useQuery({
    queryKey: STORE_BOOKMARKS_QUERY_KEY,
    queryFn: fetchStoreBookmarkIds,
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
    placeholderData: () => readSyncStoreBookmarks(),
    select: (ids) => (ids ?? []).includes(storeId),
  });
  return data === true;
}
