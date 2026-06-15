import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getStoreBookmarks } from "@/services/merchant.service";
import { useAuthStore } from "@/store/authStore";

export const STORE_BOOKMARKS_QUERY_KEY = ["store-bookmarks"] as const;

export function useStoreBookmarks() {
  const session = useAuthStore((s) => s.session);
  const isAuthenticated = Boolean(session?.accessToken);

  const query = useQuery({
    queryKey: STORE_BOOKMARKS_QUERY_KEY,
    queryFn: getStoreBookmarks,
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  const bookmarkSet = useMemo(() => new Set(query.data ?? []), [query.data]);

  return {
    bookmarkSet,
    isLoading: query.isLoading,
    isAuthenticated,
    refetch: query.refetch,
  };
}

export function useStoreBookmarkMutations() {
  const queryClient = useQueryClient();

  const syncBookmark = (storeId: string, saved: boolean) => {
    queryClient.setQueryData<string[]>(STORE_BOOKMARKS_QUERY_KEY, (prev) => {
      const list = prev ?? [];
      if (saved) {
        return list.includes(storeId) ? list : [...list, storeId];
      }
      return list.filter((id) => id !== storeId);
    });
  };

  return { syncBookmark };
}
