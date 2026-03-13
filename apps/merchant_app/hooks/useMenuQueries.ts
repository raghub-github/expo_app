/**
 * Menu data layer: all menu read/write goes through these hooks.
 * Backend remains the single source of truth; this is cache + invalidation only.
 * See backend/docs/MENU_ENGINE.md.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchMenuCategories,
  fetchMenuItems,
  fetchMenuItem,
  createMenuItem,
  updateMenuItem,
  patchItemStock,
  createCategory,
  updateCategory,
  deleteCategory,
  type MenuItemPayload,
} from "@/services/menuApi";

// ─── Query keys (single place for invalidation) ─────────────────────────────

export const menuKeys = {
  all: ["menu"] as const,
  categories: (storeId: string | null) => ["menu", "categories", storeId] as const,
  items: (
    storeId: string | null,
    filters?: {
      categoryId?: number | null;
      search?: string;
      approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
      inStock?: boolean | null;
    }
  ) => ["menu", "items", storeId, filters ?? {}] as const,
  item: (storeId: string | null, itemId: number | null) => ["menu", "item", storeId, itemId] as const,
};

// ─── Queries ───────────────────────────────────────────────────────────────

export function useMenuCategories(storeId: string | null, token: string | null) {
  return useQuery({
    queryKey: menuKeys.categories(storeId),
    queryFn: () => fetchMenuCategories(storeId!, token!).then((r) => r.categories ?? []),
    enabled: Boolean(storeId && token),
  });
}

export type MenuItemsFilters = {
  categoryId?: number | null;
  search?: string;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED" | null;
  inStock?: boolean | null;
  changeRequestType?: "DELETE" | "UPDATE" | null;
  limit?: number;
  offset?: number;
};

export function useMenuItems(
  storeId: string | null,
  token: string | null,
  filters: MenuItemsFilters = {}
) {
  return useQuery({
    queryKey: menuKeys.items(storeId, filters),
    queryFn: () =>
      fetchMenuItems(storeId!, token!, {
        categoryId: filters.categoryId ?? undefined,
        search: filters.search ?? undefined,
        approvalStatus: filters.approvalStatus ?? undefined,
        inStock: filters.inStock ?? undefined,
        changeRequestType: filters.changeRequestType ?? undefined,
        limit: filters.limit ?? 100,
        offset: filters.offset ?? 0,
      }),
    enabled: Boolean(storeId && token),
  });
}

export function useMenuItem(
  storeId: string | null,
  itemId: number | null,
  token: string | null
) {
  return useQuery({
    queryKey: menuKeys.item(storeId, itemId),
    queryFn: () => fetchMenuItem(storeId!, itemId!, token!),
    enabled: Boolean(storeId && itemId != null && !Number.isNaN(itemId) && token),
  });
}

// ─── Mutations (invalidate relevant queries so UI stays in sync) ───────────

export function useCreateMenuItem(storeId: string | null, token: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MenuItemPayload) => createMenuItem(storeId!, token!, body),
    onSuccess: () => {
      if (storeId) {
        queryClient.invalidateQueries({ queryKey: menuKeys.categories(storeId) });
        queryClient.invalidateQueries({ queryKey: ["menu", "items", storeId] });
        queryClient.invalidateQueries({ queryKey: menuKeys.all });
      }
    },
  });
}

export function useUpdateMenuItem(storeId: string | null, token: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, body }: { itemId: number; body: Partial<MenuItemPayload> & { is_active?: boolean } }) =>
      updateMenuItem(storeId!, itemId, token!, body),
    onSuccess: (_, { itemId }) => {
      if (storeId) {
        queryClient.invalidateQueries({ queryKey: menuKeys.item(storeId, itemId) });
        queryClient.invalidateQueries({ queryKey: ["menu", "items", storeId] });
        queryClient.invalidateQueries({ queryKey: menuKeys.categories(storeId) });
      }
    },
  });
}

export function usePatchItemStock(storeId: string | null, token: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      itemId,
      inStock,
    }: {
      itemId: number;
      inStock: boolean;
    }) => patchItemStock(storeId!, itemId, token!, { in_stock: inStock }),
    onSuccess: (_, { itemId }) => {
      if (storeId) {
        queryClient.invalidateQueries({ queryKey: menuKeys.item(storeId, itemId) });
        queryClient.invalidateQueries({ queryKey: ["menu", "items", storeId] });
      }
    },
  });
}

// ─── Category mutations ────────────────────────────────────────────────────

export function useCreateCategory(storeId: string | null, token: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Parameters<typeof createCategory>[2]) =>
      createCategory(storeId!, token!, body),
    onSuccess: () => {
      if (storeId) queryClient.invalidateQueries({ queryKey: menuKeys.categories(storeId) });
    },
  });
}

export function useUpdateCategory(storeId: string | null, token: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      categoryId,
      body,
    }: { categoryId: number; body: Parameters<typeof updateCategory>[3] }) =>
      updateCategory(storeId!, categoryId, token!, body),
    onSuccess: () => {
      if (storeId) queryClient.invalidateQueries({ queryKey: menuKeys.categories(storeId) });
    },
  });
}

export function useDeleteCategory(storeId: string | null, token: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: number) => deleteCategory(storeId!, categoryId, token!),
    onSuccess: () => {
      if (storeId) queryClient.invalidateQueries({ queryKey: menuKeys.categories(storeId) });
    },
  });
}
