/**
 * Hydrate in-memory active-order state from /v1/orders so the floating
 * tracking pill + live progress shade survive navigation and app reloads.
 * Includes food, person-ride, and parcel.
 */

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { orderService } from "@/services/order.service";
import type { OrderSummary } from "@/services/order.service";
import { useAuthStore } from "@/store/authStore";
import {
  useOrderStore,
  type ActiveOrder,
  type ActiveOrderService,
  type OrderStatus,
} from "@/store/orderStore";
import { isActiveOrderStatus, normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";
import { isActivePersonRideOrder, isPersonRideOrderSummary } from "@/lib/person-ride-orders";
import { resolveDockVehicleImageKey } from "@/lib/dock-vehicle-image";
import {
  getMyOrdersCachedAt,
  readSyncMyOrders,
  writeCachedMyOrders,
} from "@/lib/myOrdersCache";

export function resolveActiveOrderService(order: OrderSummary): ActiveOrderService {
  const t = (order.orderType ?? "").trim().toLowerCase();
  if (t === "person_ride" || t === "ride") return "ride";
  if (t === "parcel") return "parcel";
  if (t === "food") return "food";
  const ref = (order.formattedOrderId ?? order.orderId ?? "").trim().toUpperCase();
  if (/^GMP\d*/.test(ref)) return "ride";
  if (/^GMC\d*/.test(ref) || /^GMX\d*/.test(ref) || /^GMPARCEL/i.test(ref)) return "parcel";
  if (/^GMF\d*/.test(ref)) return "food";
  if (isPersonRideOrderSummary(order)) return "ride";
  return "food";
}

function toActiveOrder(order: OrderSummary, existing?: ActiveOrder): ActiveOrder {
  const preservedEta =
    existing?.etaMinutes != null && existing.etaMinutes > 0 ? existing.etaMinutes : 0;
  const serviceType = resolveActiveOrderService(order);
  const fromApi =
    (serviceType === "ride" || serviceType === "parcel") && order.rideType?.trim()
      ? resolveDockVehicleImageKey(order.rideType)
      : null;
  return {
    orderId: order.orderId,
    formattedOrderId: order.formattedOrderId,
    status: normalizeCustomerOrderStatus(order.status) as OrderStatus,
    etaMinutes: preservedEta,
    storeId: order.merchantPublicStoreId ?? null,
    storeName: order.merchantPublicName ?? order.merchantName ?? null,
    placedAt: new Date(order.createdAt).getTime(),
    serviceType,
    vehicleImageKey:
      fromApi ||
      existing?.vehicleImageKey ||
      (serviceType === "ride" || serviceType === "parcel" ? "bike" : null),
  };
}

function isTrackableActiveOrder(order: OrderSummary): boolean {
  if (isPersonRideOrderSummary(order)) return isActivePersonRideOrder(order);
  return isActiveOrderStatus(order.status);
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

    const active = orders.filter(isTrackableActiveOrder);
    const orderById = new Map(orders.map((o) => [o.orderId, o]));

    const stored = useOrderStore.getState().activeOrders;
    for (const storedOrder of stored) {
      const fromApi = orderById.get(storedOrder.orderId);
      if (fromApi && !isTrackableActiveOrder(fromApi)) {
        removeActiveOrder(storedOrder.orderId);
      }
    }

    for (const order of active) {
      const existing = stored.find((o) => o.orderId === order.orderId);
      addActiveOrder(toActiveOrder(order, existing));
    }
  }, [orders, addActiveOrder, removeActiveOrder]);
}
