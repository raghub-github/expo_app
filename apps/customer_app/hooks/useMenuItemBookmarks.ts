import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getMenuItemBookmarks, type BookmarkedMenuItem } from "@/services/merchant.service";
import { useAuthStore } from "@/store/authStore";

export const MENU_ITEM_BOOKMARKS_QUERY_KEY = ["menu-item-bookmarks"] as const;

export function useMenuItemBookmarks(storeId?: string | null) {
  const session = useAuthStore((s) => s.session);
  const isAuthenticated = Boolean(session?.accessToken);

  const query = useQuery({
    queryKey: storeId
      ? [...MENU_ITEM_BOOKMARKS_QUERY_KEY, storeId]
      : MENU_ITEM_BOOKMARKS_QUERY_KEY,
    queryFn: () => getMenuItemBookmarks(storeId ?? undefined),
    enabled: isAuthenticated,
    staleTime: 60 * 1000,
  });

  const bookmarkedItems = query.data ?? [];
  const bookmarkMenuItemIdSet = useMemo(
    () => new Set(bookmarkedItems.map((item) => item.menuItemId)),
    [bookmarkedItems]
  );

  return {
    bookmarkedItems,
    bookmarkMenuItemIdSet,
    isLoading: query.isLoading,
    isAuthenticated,
    refetch: query.refetch,
  };
}

export function useMenuItemBookmarkMutations() {
  const queryClient = useQueryClient();

  const syncMenuItemBookmark = (item: BookmarkedMenuItem, saved: boolean) => {
    queryClient.setQueryData<BookmarkedMenuItem[]>(MENU_ITEM_BOOKMARKS_QUERY_KEY, (prev) => {
      const list = prev ?? [];
      if (saved) {
        if (list.some((row) => row.menuItemId === item.menuItemId)) return list;
        return [item, ...list];
      }
      return list.filter((row) => row.menuItemId !== item.menuItemId);
    });

    if (item.storeId) {
      queryClient.setQueryData<BookmarkedMenuItem[]>(
        [...MENU_ITEM_BOOKMARKS_QUERY_KEY, item.storeId],
        (prev) => {
          const list = prev ?? [];
          if (saved) {
            if (list.some((row) => row.menuItemId === item.menuItemId)) return list;
            return [item, ...list];
          }
          return list.filter((row) => row.menuItemId !== item.menuItemId);
        }
      );
    }
  };

  const removeMenuItemBookmark = (menuItemId: number, storeId?: string) => {
    queryClient.setQueryData<BookmarkedMenuItem[]>(MENU_ITEM_BOOKMARKS_QUERY_KEY, (prev) =>
      (prev ?? []).filter((row) => row.menuItemId !== menuItemId)
    );
    if (storeId) {
      queryClient.setQueryData<BookmarkedMenuItem[]>(
        [...MENU_ITEM_BOOKMARKS_QUERY_KEY, storeId],
        (prev) => (prev ?? []).filter((row) => row.menuItemId !== menuItemId)
      );
    }
  };

  return { syncMenuItemBookmark, removeMenuItemBookmark };
}
