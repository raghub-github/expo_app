/**
 * Hydrate in-memory active-order state from /v1/orders so the floating
 * tracking pill survives navigation and app reloads.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { orderService } from "@/services/order.service";
import type { OrderSummary } from "@/services/order.service";
import { useAuthStore } from "@/store/authStore";
import { useOrderStore, type ActiveOrder, type OrderStatus } from "@/store/orderStore";
import { isActiveOrderStatus, normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";
import { isPersonRideOrderSummary } from "@/lib/person-ride-orders";
import {
  getMyOrdersCachedAt,
  readSyncMyOrders,
  writeCachedMyOrders,
} from "@/lib/myOrdersCache";

function toActiveOrder(
  order: import("@/services/order.service").OrderSummary,
  existing?: ActiveOrder
): ActiveOrder {
  const preservedEta =
    existing?.etaMinutes != null && existing.etaMinutes > 0 ? existing.etaMinutes : 0;
  return {
    orderId: order.orderId,
    formattedOrderId: order.formattedOrderId,
    status: normalizeCustomerOrderStatus(order.status) as OrderStatus,
    etaMinutes: preservedEta,
    storeId: order.merchantPublicStoreId ?? null,
    storeName: order.merchantPublicName ?? order.merchantName ?? null,
    placedAt: new Date(order.createdAt).getTime(),
  };
}

export function useActiveOrdersHydration() {
  const hydrated = useAuthStore((s) => s.hydrated);
  const hasSession = useAuthStore((s) => !!s.session);
  const addActiveOrder = useOrderStore((s) => s.addActiveOrder);
  const removeActiveOrder = useOrderStore((s) => s.removeActiveOrder);
  const cachedOrders = readSyncMyOrders() as OrderSummary[] | undefined;

  const { data: orders } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const list = await orderService.getMyOrders({ limit: 50 });
      void writeCachedMyOrders(list);
      return list;
    },
    enabled: hydrated && hasSession,
    staleTime: 15_000,
    refetchInterval: 30_000,
    initialData: cachedOrders,
    initialDataUpdatedAt: getMyOrdersCachedAt(),
    placeholderData: (previous) => previous ?? cachedOrders,
  });

  useEffect(() => {
    if (!orders) return;

    const activeFood = orders.filter(
      (o) => !isPersonRideOrderSummary(o) && isActiveOrderStatus(o.status)
    );
    const orderById = new Map(orders.map((o) => [o.orderId, o]));

    const stored = useOrderStore.getState().activeOrders;
    for (const storedOrder of stored) {
      const fromApi = orderById.get(storedOrder.orderId);
      // Keep freshly placed orders until the orders list includes them.
      if (fromApi && !isActiveOrderStatus(fromApi.status)) {
        removeActiveOrder(storedOrder.orderId);
      }
    }

    for (const order of activeFood) {
      const existing = stored.find((o) => o.orderId === order.orderId);
      addActiveOrder(toActiveOrder(order, existing));
    }
  }, [orders, addActiveOrder, removeActiveOrder]);
}
