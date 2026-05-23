/**
 * Orders hook — loads food orders from merchant-partner API (Partner Site pipeline).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  fetchFoodOrders,
  patchFoodOrderStatus,
  type ApiFoodOrder,
  type ApiFoodOrderItem,
} from "@/services/ordersApi";
import { merchantOrderBillTotal } from "@/lib/merchant-line-total";
import { getStoreSettings } from "@/services/storeSettingsApi";

export type DeliveryType = "GATIMITRA_RIDER" | "SELF_DELIVERY" | "SELF_PICKUP";

export type OrderStage =
  | "created"
  | "preparing"
  | "ready"
  | "picked_up"
  | "delivered"
  | "rejected"
  | "rto";

export type LineItem = {
  qty: number;
  name: string;
  price: number;
  vegNonveg?: string | null;
  customization_lines?: ApiFoodOrderItem["customization_lines"];
  base_amount?: number;
  customizations_total?: number;
  captured_base_amount?: number;
  captured_addon_amount?: number;
};

export type OrderRecord = {
  id: string;
  ordersCoreId: number;
  orderNumber: string;
  formattedOrderId: string | null;
  customerName: string;
  createdAt: string;
  displayTime: string;
  lineItems: LineItem[];
  total: number;
  status: OrderStage;
  /** Raw API status (CREATED, ACCEPTED, PREPARING, …) for valid transitions. */
  pipelineStatus: string;
  deliveryType: DeliveryType;
  pickupOtp?: string;
  rtoOtp?: string;
  rejectedReason?: string | null;
  acceptedByLabel?: string | null;
  cancelledByLabel?: string | null;
  cancelledByType?: string | null;
  cancelledAt?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  dropAddress?: string | null;
  distanceKm?: number | null;
  customerStoreOrderOrdinal?: number | null;
  customerStoreOrdersTotal?: number | null;
  isBulkOrder?: boolean;
  vegNonVeg?: string | null;
};

export type OrderCounts = {
  all: number;
} & Record<OrderStage, number>;

function formatDisplayTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Asia/Kolkata",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return formatDisplayTime(iso);
}

export function apiStatusToStage(api: string): OrderStage {
  const u = api.toUpperCase();
  if (u === "CREATED" || u === "NEW" || u === "PLACED") return "created";
  if (u === "ACCEPTED" || u === "PREPARING") return "preparing";
  if (u === "READY_FOR_PICKUP") return "ready";
  if (u === "OUT_FOR_DELIVERY") return "picked_up";
  if (u === "DELIVERED") return "delivered";
  if (u === "CANCELLED") return "rejected";
  if (u === "RTO") return "rto";
  return "created";
}

export function stageTransitionToApi(from: OrderStage, to: OrderStage): string {
  if (to === "rejected") return "CANCELLED";
  if (to === "rto") return "RTO";
  if (from === "created" && to === "preparing") return "ACCEPTED";
  if (from === "preparing" && to === "ready") return "READY_FOR_PICKUP";
  if (from === "ready" && to === "picked_up") return "OUT_FOR_DELIVERY";
  if (from === "picked_up" && to === "delivered") return "DELIVERED";
  return to.toUpperCase();
}

function mapApiOrder(o: ApiFoodOrder): OrderRecord {
  const formatted = (o.formatted_order_id ?? "").trim();
  const orderNumber =
    formatted.length > 0
      ? formatted
      : o.orders_core_id > 0
        ? String(o.orders_core_id)
        : String(o.orders_food_id);
  const deliveryType = (o.delivery_type ?? "GATIMITRA_RIDER") as DeliveryType;

  const foodRowId = o.core_only ? null : o.orders_food_id;
  const cancelledAt = o.cancelled_at?.trim() || null;
  const customerName = (o.customer_name ?? "").trim();

  return {
    id: foodRowId != null ? String(foodRowId) : `core-${o.orders_core_id}`,
    ordersCoreId: o.orders_core_id,
    orderNumber,
    formattedOrderId: formatted || null,
    customerName: customerName || "Guest",
    createdAt: o.created_at,
    displayTime: formatDisplayTime(o.created_at),
    lineItems: (o.items ?? []).map((it) => ({
      qty: it.qty,
      name: it.name,
      price: Number(it.price) || 0,
      vegNonveg: it.veg_nonveg ?? null,
      customization_lines: it.customization_lines,
      base_amount: it.base_amount,
      customizations_total: it.customizations_total,
      captured_base_amount: it.captured_base_amount,
      captured_addon_amount: it.captured_addon_amount,
    })),
    total: merchantOrderBillTotal(o),
    status: apiStatusToStage(o.order_status),
    pipelineStatus: String(o.order_status || "CREATED").toUpperCase(),
    deliveryType,
    pickupOtp: o.pickup_otp ?? undefined,
    rtoOtp: o.rto_otp ?? undefined,
    rejectedReason: o.rejected_reason ?? null,
    acceptedByLabel: o.accepted_by_label ?? null,
    cancelledByLabel: o.cancelled_by_label ?? null,
    cancelledByType: o.cancelled_by_type ?? null,
    cancelledAt,
    customerPhone: o.customer_phone?.trim() || null,
    customerEmail: o.customer_email?.trim() || null,
    dropAddress: o.drop_address?.trim() || null,
    distanceKm: o.distance_km != null ? Number(o.distance_km) : null,
    customerStoreOrderOrdinal: o.customer_store_order_ordinal ?? null,
    customerStoreOrdersTotal: o.customer_store_orders_total ?? null,
    isBulkOrder: Boolean(o.is_bulk_order),
    vegNonVeg: o.veg_non_veg ?? null,
  };
}

function canTransition(order: OrderRecord, next: OrderStage): boolean {
  if (order.deliveryType === "GATIMITRA_RIDER") {
    if (next === "picked_up" || next === "delivered" || next === "rto") {
      return false;
    }
  }
  return true;
}

export type OrdersState = {
  orders: OrderRecord[];
  loading: boolean;
  error: string | null;
  counts: OrderCounts;
};

export function useOrders(pollIntervalMs = 8000) {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const autoAcceptedRef = useRef<Set<number>>(new Set());
  const autoAcceptTimersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const refetch = useCallback(async () => {
    if (!token || !storeId) {
      setOrders([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const [list, storeSettings] = await Promise.all([
        fetchFoodOrders(storeId, token, { limit: 200 }),
        getStoreSettings(storeId, token).catch(() => null),
      ]);
      const mapped = list.map(mapApiOrder);
      setOrders(mapped);

      if (storeSettings?.auto_accept_orders) {
        const delayMs = Math.max(0, Math.min(600, storeSettings.auto_accept_time_seconds || 0)) * 1000;
        for (const row of list) {
          const st = apiStatusToStage(row.order_status);
          if (st !== "created" || row.core_only) continue;
          const fid = row.orders_food_id;
          if (autoAcceptedRef.current.has(fid)) continue;
          if (autoAcceptTimersRef.current.has(fid)) continue;
          const timer = setTimeout(() => {
            autoAcceptTimersRef.current.delete(fid);
            if (autoAcceptedRef.current.has(fid)) return;
            autoAcceptedRef.current.add(fid);
            void patchFoodOrderStatus(storeId, fid, token, "ACCEPTED", undefined, {
              action_source: "app",
              accept_mode: "auto",
            })
              .then((updated) => {
                setOrders((prev) =>
                  prev.map((o) => (o.id === String(fid) ? mapApiOrder(updated) : o))
                );
              })
              .catch(() => {
                autoAcceptedRef.current.delete(fid);
              });
          }, delayMs);
          autoAcceptTimersRef.current.set(fid, timer);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    setLoading(true);
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) return undefined;
    const id = setInterval(() => {
      void refetch();
    }, pollIntervalMs);
    return () => clearInterval(id);
  }, [pollIntervalMs, refetch]);

  const transitionOrder = useCallback(
    async (
      orderId: string,
      nextStatus: OrderStage,
      opts?: { rejectedReason?: string }
    ) => {
      if (!token || !storeId) return;
      if (orderId.startsWith("core-")) {
        setError("Order is still syncing; refresh in a moment or use Partner Site.");
        return;
      }
      const order = orders.find((o) => o.id === orderId);
      if (!order || !canTransition(order, nextStatus)) return;

      const apiStatus = stageTransitionToApi(order.status, nextStatus);
      const rejectedReason =
        nextStatus === "rejected" ? opts?.rejectedReason?.trim() : undefined;
      if (nextStatus === "rejected" && !rejectedReason) {
        setError("Select a cancellation reason.");
        return;
      }

      const prev = orders;
      setOrders((list) =>
        list.map((o) => (o.id === orderId ? { ...o, status: nextStatus } : o))
      );

      const patchOpts = {
        action_source: "app" as const,
        accept_mode: "manual" as const,
        cancel_mode: "manual" as const,
      };

      try {
        if (apiStatus === "READY_FOR_PICKUP" && order.pipelineStatus === "ACCEPTED") {
          try {
            await patchFoodOrderStatus(
              storeId,
              Number(orderId),
              token,
              "PREPARING",
              undefined,
              patchOpts
            );
          } catch (prepErr) {
            const msg = prepErr instanceof Error ? prepErr.message : "";
            if (!/invalid transition/i.test(msg)) throw prepErr;
          }
        }

        const updated = await patchFoodOrderStatus(
          storeId,
          Number(orderId),
          token,
          apiStatus,
          rejectedReason,
          patchOpts
        );
        setOrders((list) =>
          list.map((o) => (o.id === orderId ? mapApiOrder(updated) : o))
        );
        setError(null);
      } catch (e) {
        setOrders(prev);
        setError(e instanceof Error ? e.message : "Failed to update order");
        throw e;
      }
    },
    [token, storeId, orders]
  );

  const counts: OrderCounts = useMemo(() => {
    const base: OrderCounts = {
      all: orders.length,
      created: 0,
      preparing: 0,
      ready: 0,
      picked_up: 0,
      delivered: 0,
      rejected: 0,
      rto: 0,
    };
    for (const o of orders) {
      base[o.status] += 1;
    }
    return base;
  }, [orders]);

  return {
    orders,
    loading,
    error,
    refetch,
    transitionOrder,
    counts,
    formatRelativeTime,
  };
}
