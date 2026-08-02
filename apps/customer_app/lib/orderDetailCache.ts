/**
 * Instant order detail paint from list cache while full detail API loads.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { OrderDetail, OrderSummary } from "@/services/order.service";

export function seedOrderDetailCache(
  queryClient: QueryClient,
  orderId: string,
  patch: Partial<OrderDetail> & Pick<OrderDetail, "orderId">
) {
  queryClient.setQueryData<OrderDetail>(["order", orderId], (prev) => ({
    ...(prev ?? {
      orderId,
      status: patch.status ?? "ORDER_PLACED",
      createdAt: patch.createdAt ?? new Date().toISOString(),
    }),
    ...patch,
  }));
}

export function findOrderInListCache(
  queryClient: QueryClient,
  orderId: string
): OrderSummary | undefined {
  const lists = queryClient.getQueriesData<OrderSummary[]>({ queryKey: ["my-orders"] });
  for (const [, rows] of lists) {
    if (!Array.isArray(rows)) continue;
    const hit = rows.find(
      (o) => o.orderId === orderId || o.formattedOrderId === orderId
    );
    if (hit) return hit;
  }
  return undefined;
}

export function orderSummaryToDetail(summary: OrderSummary): OrderDetail {
  return {
    ...summary,
    billingSnapshot: null,
    deliveryAddress: summary.deliveryAddress,
    deliveryLat: summary.deliveryLat ?? null,
    deliveryLng: summary.deliveryLng ?? null,
    pickupLat: summary.pickupLat ?? null,
    pickupLng: summary.pickupLng ?? null,
    deliveryOtp: null,
    paymentMethod: null,
    paymentStatus: null,
    rider: undefined,
    statusHistory: [{ status: summary.status, at: summary.createdAt }],
  };
}

export function getOrderDetailInitialData(
  queryClient: QueryClient,
  orderId: string
): OrderDetail | undefined {
  const cachedDetail = queryClient.getQueryData<OrderDetail>(["order", orderId]);
  if (cachedDetail) return cachedDetail;
  const fromList = findOrderInListCache(queryClient, orderId);
  return fromList ? orderSummaryToDetail(fromList) : undefined;
}
