/**
 * Active order state – after place order, cart transforms into "Track Live" until delivered.
 * Supports multiple active orders (horizontal dock) across food / ride / parcel.
 */

import { create } from "zustand";
import {
  isCustomerOrderTerminalStatus,
  orderRefsMatch,
  selectAuthoritativeCustomerStatus,
} from "@/lib/customer-order-status-machine";
import { normalizeCustomerOrderStatus } from "@/lib/customer-order-status-display";

export type OrderStatus =
  | "ORDER_PLACED"
  | "PREPARING"
  | "PICKED_UP"
  | "OUT_FOR_DELIVERY"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "CANCELLED";

export type ActiveOrderService = "food" | "ride" | "parcel";

export type ActiveOrder = {
  orderId: string;
  formattedOrderId?: string | null;
  status: OrderStatus;
  etaMinutes: number;
  storeId: string | null;
  storeName: string | null;
  placedAt: number;
  /** Drives live progress shade copy (food / ride / parcel). */
  serviceType?: ActiveOrderService;
  /**
   * Booked vehicle thumb for ride/parcel dock pill
   * (bike | auto | van | cab | cab_premium | travel, or catalog/category id).
   */
  vehicleImageKey?: string | null;
  /** Takeaway / self-pickup — floating pill shows map CTA instead of Track Live. */
  isSelfPickup?: boolean;
};

export type PrepDelayBanner = {
  orderId: string;
  message: string;
  expiresAt: number;
  /** Extra minutes the store just added (Need more time). */
  additionalMinutes?: number;
};

type OrderState = {
  /** @deprecated Use activeOrders and setActiveOrder for single add; kept for backward compat. */
  activeOrder: ActiveOrder | null;
  /** All active (non-delivered, non-cancelled) orders for multi-order dock. */
  activeOrders: ActiveOrder[];
  /** Transient marquee when merchant adds prep delay (20s). */
  prepDelayBanner: PrepDelayBanner | null;
  setActiveOrder: (order: ActiveOrder | null) => void;
  addActiveOrder: (order: ActiveOrder) => void;
  removeActiveOrder: (orderId: string) => void;
  updateStatus: (status: OrderStatus, etaMinutes?: number) => void;
  updateOrderStatus: (
    orderId: string,
    status: OrderStatus,
    etaMinutes?: number,
    /** Live data can upgrade the optimistic order: GM… → GMF… id, resolved store name. */
    patch?: {
      formattedOrderId?: string | null;
      storeName?: string | null;
      serviceType?: ActiveOrderService;
      vehicleImageKey?: string | null;
    }
  ) => void;
  showPrepDelayBanner: (
    orderId: string,
    message: string,
    durationMs?: number,
    additionalMinutes?: number
  ) => void;
  clearPrepDelayBanner: () => void;
  clearActiveOrder: () => void;
};

function mergeActiveOrder(existing: ActiveOrder | undefined, incoming: ActiveOrder): ActiveOrder {
  const eta =
    incoming.etaMinutes <= 0 && existing && existing.etaMinutes > 0
      ? existing.etaMinutes
      : incoming.etaMinutes;
  return {
    ...existing,
    ...incoming,
    etaMinutes: eta,
    serviceType: incoming.serviceType ?? existing?.serviceType ?? "food",
    vehicleImageKey:
      incoming.vehicleImageKey?.trim() ||
      existing?.vehicleImageKey?.trim() ||
      null,
    isSelfPickup: incoming.isSelfPickup ?? existing?.isSelfPickup ?? false,
  };
}

export const useOrderStore = create<OrderState>((set) => ({
  activeOrder: null,
  activeOrders: [],
  prepDelayBanner: null,

  setActiveOrder: (order) =>
    set((s) => {
      if (!order) return { activeOrder: null };
      if (isCustomerOrderTerminalStatus(order.status)) {
        const next = s.activeOrders.filter((o) => !orderRefsMatch(o, order));
        const still = next.length > 0 ? next[0]! : null;
        return { activeOrder: still, activeOrders: next };
      }
      const exists = s.activeOrders.find((o) => orderRefsMatch(o, order));
      const merged = mergeActiveOrder(exists, {
        ...order,
        status: exists
          ? (selectAuthoritativeCustomerStatus(exists.status, order.status) as OrderStatus)
          : (normalizeCustomerOrderStatus(order.status) as OrderStatus),
      });
      const alreadyListed = s.activeOrders.some((o) => orderRefsMatch(o, order));
      const activeOrders = alreadyListed
        ? s.activeOrders.map((o) => (orderRefsMatch(o, order) ? merged : o))
        : [...s.activeOrders, merged];
      return { activeOrder: merged, activeOrders };
    }),

  addActiveOrder: (order) =>
    set((s) => {
      if (isCustomerOrderTerminalStatus(order.status)) {
        const next = s.activeOrders.filter((o) => !orderRefsMatch(o, order));
        const still = next.length > 0 ? next[0]! : null;
        const activeOrder = s.activeOrder && orderRefsMatch(s.activeOrder, order) ? still : s.activeOrder;
        return { activeOrder, activeOrders: next };
      }
      const exists = s.activeOrders.find((o) => orderRefsMatch(o, order));
      const incomingStatus = normalizeCustomerOrderStatus(order.status) as OrderStatus;
      const merged = mergeActiveOrder(exists, {
        ...order,
        status: exists
          ? (selectAuthoritativeCustomerStatus(exists.status, incomingStatus) as OrderStatus)
          : incomingStatus,
      });
      const next = exists
        ? s.activeOrders.map((o) => (orderRefsMatch(o, order) ? merged : o))
        : [...s.activeOrders, merged];
      return { activeOrder: merged, activeOrders: next };
    }),

  removeActiveOrder: (orderId) =>
    set((s) => {
      const next = s.activeOrders.filter((o) => !orderRefsMatch(o, orderId));
      const still = next.length > 0 ? next[0]! : null;
      return {
        activeOrder: s.activeOrder && orderRefsMatch(s.activeOrder, orderId) ? still : s.activeOrder,
        activeOrders: next,
      };
    }),

  updateStatus: (status, etaMinutes) =>
    set((s) =>
      s.activeOrder
        ? {
            activeOrder: {
              ...s.activeOrder,
              status,
              ...(etaMinutes != null && { etaMinutes }),
            },
            activeOrders: s.activeOrders.map((o) =>
              o.orderId === s.activeOrder!.orderId
                ? { ...o, status, ...(etaMinutes != null && { etaMinutes }) }
                : o
            ),
          }
        : s
    ),

  updateOrderStatus: (orderId, status, etaMinutes, patch) =>
    set((s) => {
      const incoming = normalizeCustomerOrderStatus(status) as OrderStatus;
      if (isCustomerOrderTerminalStatus(incoming)) {
        const next = s.activeOrders.filter((o) => !orderRefsMatch(o, orderId));
        const still = next.length > 0 ? next[0]! : null;
        return {
          activeOrder: s.activeOrder && orderRefsMatch(s.activeOrder, orderId) ? still : s.activeOrder,
          activeOrders: next,
        };
      }

      const apply = (o: ActiveOrder): ActiveOrder => {
        const nextStatus = selectAuthoritativeCustomerStatus(o.status, incoming) as OrderStatus;
        return {
          ...o,
          status: nextStatus,
          ...(etaMinutes != null && { etaMinutes }),
          ...(patch?.formattedOrderId ? { formattedOrderId: patch.formattedOrderId } : {}),
          ...(patch?.storeName ? { storeName: patch.storeName } : {}),
          ...(patch?.serviceType ? { serviceType: patch.serviceType } : {}),
          ...(patch?.vehicleImageKey
            ? { vehicleImageKey: patch.vehicleImageKey }
            : {}),
        };
      };
      const same =
        (o: ActiveOrder | null | undefined) =>
          !!o &&
          o.status === selectAuthoritativeCustomerStatus(o.status, incoming) &&
          (etaMinutes == null || o.etaMinutes === etaMinutes) &&
          (!patch?.formattedOrderId || o.formattedOrderId === patch.formattedOrderId) &&
          (!patch?.storeName || o.storeName === patch.storeName) &&
          (!patch?.serviceType || o.serviceType === patch.serviceType) &&
          (!patch?.vehicleImageKey || o.vehicleImageKey === patch.vehicleImageKey);

      const activeUnchanged =
        !s.activeOrder || !orderRefsMatch(s.activeOrder, orderId) || same(s.activeOrder);
      const listUnchanged = s.activeOrders.every((o) =>
        orderRefsMatch(o, orderId) ? same(o) : true
      );
      if (activeUnchanged && listUnchanged) return s;

      return {
        activeOrder:
          s.activeOrder && orderRefsMatch(s.activeOrder, orderId)
            ? apply(s.activeOrder)
            : s.activeOrder,
        activeOrders: s.activeOrders.map((o) => (orderRefsMatch(o, orderId) ? apply(o) : o)),
      };
    }),

  showPrepDelayBanner: (orderId, message, durationMs = 20_000, additionalMinutes) =>
    set({
      prepDelayBanner: {
        orderId,
        message,
        expiresAt: Date.now() + durationMs,
        additionalMinutes:
          additionalMinutes != null && Number.isFinite(additionalMinutes) && additionalMinutes > 0
            ? Math.round(additionalMinutes)
            : undefined,
      },
    }),

  clearPrepDelayBanner: () => set({ prepDelayBanner: null }),

  clearActiveOrder: () => set({ activeOrder: null, activeOrders: [], prepDelayBanner: null }),
}));
