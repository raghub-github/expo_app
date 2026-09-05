/**
 * Instant order detail paint from list cache while full detail API loads.
 */

import type { QueryClient } from "@tanstack/react-query";
import type { OrderDetail, OrderSummary } from "@/services/order.service";
import { mergeCaptainProfile } from "@/lib/mergeCaptainProfile";
import { selectAuthoritativeCustomerStatus } from "@/lib/customer-order-status-machine";

export function mergeIncomingOrderDetail(
  prev: OrderDetail | undefined,
  incoming: OrderDetail
): OrderDetail {
  const status = selectAuthoritativeCustomerStatus(prev?.status, incoming.status);
  return {
    ...incoming,
    status,
    rider: mergeCaptainProfile(prev?.rider, incoming.rider) ?? incoming.rider,
    billingSnapshot: incoming.billingSnapshot ?? prev?.billingSnapshot ?? null,
    checkoutMetadata: incoming.checkoutMetadata ?? prev?.checkoutMetadata ?? null,
    paymentStatus: incoming.paymentStatus ?? prev?.paymentStatus ?? null,
    paymentMethod: incoming.paymentMethod ?? prev?.paymentMethod ?? null,
  };
}

export function seedOrderDetailCache(
  queryClient: QueryClient,
  orderId: string,
  patch: Partial<OrderDetail> & Pick<OrderDetail, "orderId">
) {
  queryClient.setQueryData<OrderDetail>(["order", orderId], (prev) => {
    const incomingStatus = patch.status ?? prev?.status ?? "ORDER_PLACED";
    const status = selectAuthoritativeCustomerStatus(prev?.status, incomingStatus);
    const base = {
      ...(prev ?? {
        orderId,
        status,
        createdAt: patch.createdAt ?? new Date().toISOString(),
      }),
      ...patch,
      status,
    };
    if (patch.rider !== undefined) {
      base.rider = mergeCaptainProfile(prev?.rider, patch.rider) ?? patch.rider;
    }
    return base;
  });
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
    billingSnapshot: summary.billingSnapshot ?? null,
    deliveryAddress: summary.deliveryAddress ?? undefined,
    deliveryLat: summary.deliveryLat ?? null,
    deliveryLng: summary.deliveryLng ?? null,
    pickupLat: summary.pickupLat ?? null,
    pickupLng: summary.pickupLng ?? null,
    deliveryOtp: null,
    paymentMethod: summary.paymentMethod ?? null,
    paymentStatus: summary.paymentStatus ?? null,
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
