/**
 * Hydrate in-memory active-order state from /v1/orders so the floating
 * tracking pill + live progress shade survive navigation and app reloads.
 * Includes food, person-ride, and parcel.
 */

import { useEffect } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { orderRefsMatch } from "@/lib/customer-order-status-machine";
import { isActivePersonRideOrder, isPersonRideOrderSummary } from "@/lib/person-ride-orders";
import { resolveDockVehicleImageKey } from "@/lib/dock-vehicle-image";
import { isSelfPickupOrder } from "@/lib/self-pickup-order";
import { catchUpActiveCustomerOrders } from "@/lib/catchUpActiveCustomerOrders";
import { mergeIncomingMyOrdersList } from "@/lib/apply-customer-order-status";
import {
  getMyOrdersCachedAt,
  readSyncMyOrders,
  writeCachedMyOrders,
} from "@/lib/myOrdersCache";

/**
 * A live order (food / ride / parcel) always completes within a few hours. An
 * order still shown as "active" many hours after it was placed is almost always
 * one whose terminal update (cancel / deliver) the app missed while it was
 * closed — its cached status is stale. We never seed / keep such an order as a
 * live tracker, which is what stopped a day-old "Order placed · Waiting for
 * store confirmation" sticky from reappearing on every app open.
 */
export const LIVE_ORDER_MAX_AGE_MS = 8 * 60 * 60 * 1000; // 8 hours

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
    isSelfPickup:
      serviceType === "food"
        ? isSelfPickupOrder({ deliveryType: order.deliveryType })
        : false,
  };
}

function isTrackableActiveOrder(order: OrderSummary): boolean {
  if (isPersonRideOrderSummary(order)) return isActivePersonRideOrder(order);
  return isActiveOrderStatus(order.status);
}

export function useActiveOrdersHydration() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((s) => s.hydrated);
  const hasSession = useAuthStore((s) => !!s.session);
  const hasTrackableOrders = useOrderStore((s) => s.activeOrders.length > 0);
  const addActiveOrder = useOrderStore((s) => s.addActiveOrder);
  const removeActiveOrder = useOrderStore((s) => s.removeActiveOrder);
  const cachedOrders = readSyncMyOrders() as OrderSummary[] | undefined;

  const { data: orders } = useQuery({
    queryKey: ["my-orders"],
    queryFn: async () => {
      const list = await orderService.getMyOrders({ limit: 50 });
      const prev =
        queryClient.getQueryData<OrderSummary[]>(["my-orders"]) ??
        (readSyncMyOrders() as OrderSummary[] | undefined);
      const merged = mergeIncomingMyOrdersList(list, prev);
      void writeCachedMyOrders(merged);
      return merged;
    },
    enabled: hydrated && hasSession,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: true,
    refetchOnWindowFocus: "always",
    refetchInterval:
      hydrated && hasSession && hasTrackableOrders ? 8_000 : false,
    refetchIntervalInBackground: false,
    initialData: cachedOrders,
    initialDataUpdatedAt: getMyOrdersCachedAt(),
    placeholderData: (previous) => previous ?? cachedOrders,
  });

  useEffect(() => {
    if (!hydrated || !hasSession) return;
    void catchUpActiveCustomerOrders(queryClient);
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      void catchUpActiveCustomerOrders(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
    });
    return () => sub.remove();
  }, [hydrated, hasSession, queryClient]);

  useEffect(() => {
    if (!orders) return;

    const now = Date.now();
    const active = orders.filter(isTrackableActiveOrder);
    const stored = useOrderStore.getState().activeOrders;

    for (const storedOrder of stored) {
      const fromApi = orders.find((o) => orderRefsMatch(o, storedOrder));
      if (fromApi && !isTrackableActiveOrder(fromApi)) {
        removeActiveOrder(storedOrder.orderId);
        if (storedOrder.formattedOrderId) {
          removeActiveOrder(storedOrder.formattedOrderId);
        }
      }
    }

    // Evict stale-aged trackers whose terminal update the app missed while
    // closed (see LIVE_ORDER_MAX_AGE_MS). Prevents a day-old sticky/pill from
    // being kept alive on open even when the server no longer lists the order.
    for (const storedOrder of stored) {
      const placedAt = storedOrder.placedAt || 0;
      if (placedAt > 0 && now - placedAt > LIVE_ORDER_MAX_AGE_MS) {
        removeActiveOrder(storedOrder.orderId);
        if (storedOrder.formattedOrderId) {
          removeActiveOrder(storedOrder.formattedOrderId);
        }
      }
    }

    for (const order of active) {
      // Never seed a stale-aged order from the (possibly outdated) disk cache.
      const placedAt = new Date(order.createdAt).getTime();
      if (Number.isFinite(placedAt) && now - placedAt > LIVE_ORDER_MAX_AGE_MS) {
        continue;
      }
      const existing = stored.find((o) => orderRefsMatch(o, order));
      addActiveOrder(toActiveOrder(order, existing));
    }
  }, [orders, addActiveOrder, removeActiveOrder]);
}
