// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
import { router } from "expo-router";
import type { QueryClient } from "@tanstack/react-query";
import type { RiderOrderSummary } from "@/src/services/api/riderApi";

export function riderOrderDetailQueryKey(orderId: string) {
  return ["rider", "orders", "detail", orderId] as const;
}

export function openOrderHistoryDetail(
  order: RiderOrderSummary,
  queryClient?: QueryClient
) {
  const id = order.id?.trim();
  if (!id) return;

  if (queryClient) {
    queryClient.setQueryData(riderOrderDetailQueryKey(id), order);
  }

  router.push({
    pathname: "/order-history/[id]",
    params: {
      id,
      category: order.category,
    },
  });
}
