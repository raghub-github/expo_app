"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { resolveOrderTypeFromPublicId } from "@/lib/orders/resolve-order-type-from-public-id";

export interface OrderCoreFetchParams {
  orderPublicId: string;
  skipCache?: boolean;
}

export async function fetchOrderCorePayload(
  params: OrderCoreFetchParams,
  signal?: AbortSignal
): Promise<unknown> {
  const orderType = resolveOrderTypeFromPublicId(params.orderPublicId);
  const search = new URLSearchParams({
    orderType,
    searchType: "Order Id",
    search: params.orderPublicId,
    limit: "1",
  });
  if (params.skipCache) {
    search.set("skipCache", "1");
  }
  const res = await fetch(`/api/orders/core?${search.toString()}`, { signal });
  return res.json();
}

export function orderDetailQueryKey(orderPublicId: string) {
  return queryKeys.orders.detail(orderPublicId);
}

/**
 * Cached order payload for standalone order page.
 * Survives remounts and soft navigations within the same tab; manual refresh still refetches.
 */
export function useOrderDetailQuery(orderPublicId: string, enabled = true) {
  return useQuery({
    queryKey: orderDetailQueryKey(orderPublicId),
    queryFn: ({ signal }) => fetchOrderCorePayload({ orderPublicId }, signal),
    enabled: Boolean(orderPublicId) && enabled,
    staleTime: 3 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}

export function invalidateOrderDetailQuery(
  queryClient: ReturnType<typeof useQueryClient>,
  orderPublicId: string
) {
  return queryClient.invalidateQueries({ queryKey: orderDetailQueryKey(orderPublicId) });
}

export async function refetchOrderDetailFresh(
  queryClient: ReturnType<typeof useQueryClient>,
  orderPublicId: string
) {
  return queryClient.fetchQuery({
    queryKey: [...orderDetailQueryKey(orderPublicId), "fresh"],
    queryFn: ({ signal }) =>
      fetchOrderCorePayload({ orderPublicId, skipCache: true }, signal),
    staleTime: 0,
  });
}
