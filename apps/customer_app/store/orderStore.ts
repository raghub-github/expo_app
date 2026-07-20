/**
 * Active order state – after place order, cart transforms into "Track Live" until delivered.
 * Supports multiple active orders (horizontal dock). Status flow: ORDER_PLACED → PREPARING → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED.
 */

import { create } from "zustand";

export type OrderStatus =
  | "ORDER_PLACED"
  | "PREPARING"
  | "PICKED_UP"
  | "OUT_FOR_DELIVERY"
  | "ON_THE_WAY"
  | "DELIVERED"
  | "CANCELLED";

export type ActiveOrder = {
  orderId: string;
  formattedOrderId?: string | null;
  status: OrderStatus;
  etaMinutes: number;
  storeId: string | null;
  storeName: string | null;
  placedAt: number;
};

export type PrepDelayBanner = {
  orderId: string;
  message: string;
  expiresAt: number;
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
    patch?: { formattedOrderId?: string | null; storeName?: string | null }
  ) => void;
  showPrepDelayBanner: (orderId: string, message: string, durationMs?: number) => void;
  clearPrepDelayBanner: () => void;
  clearActiveOrder: () => void;
};

export const useOrderStore = create<OrderState>((set) => ({
  activeOrder: null,
  activeOrders: [],
  prepDelayBanner: null,

  setActiveOrder: (order) =>
    set((s) => {
      if (!order) return { activeOrder: null };
      const exists = s.activeOrders.find((o) => o.orderId === order.orderId);
      const merged =
        exists && order.etaMinutes <= 0 && exists.etaMinutes > 0
          ? { ...order, etaMinutes: exists.etaMinutes }
          : order;
      const alreadyListed = s.activeOrders.some((o) => o.orderId === order.orderId);
      const activeOrders = alreadyListed
        ? s.activeOrders.map((o) => (o.orderId === order.orderId ? merged : o))
        : [...s.activeOrders, merged];
      return { activeOrder: merged, activeOrders };
    }),

  addActiveOrder: (order) =>
    set((s) => {
      const exists = s.activeOrders.find((o) => o.orderId === order.orderId);
      const merged =
        exists && order.etaMinutes <= 0 && exists.etaMinutes > 0
          ? { ...order, etaMinutes: exists.etaMinutes }
          : order;
      const next = exists
        ? s.activeOrders.map((o) => (o.orderId === order.orderId ? merged : o))
        : [...s.activeOrders, merged];
      return { activeOrder: merged, activeOrders: next };
    }),

  removeActiveOrder: (orderId) =>
    set((s) => {
      const next = s.activeOrders.filter((o) => o.orderId !== orderId);
      const still = next.length > 0 ? next[0]! : null;
      return { activeOrder: s.activeOrder?.orderId === orderId ? still : s.activeOrder, activeOrders: next };
    }),

  updateStatus: (status, etaMinutes) =>
    set((s) =>
      s.activeOrder
        ? {
            activeOrder: { ...s.activeOrder, status, ...(etaMinutes != null && { etaMinutes }) },
            activeOrders: s.activeOrders.map((o) =>
              o.orderId === s.activeOrder!.orderId ? { ...o, status, ...(etaMinutes != null && { etaMinutes }) } : o
            ),
          }
        : s
    ),

  updateOrderStatus: (orderId, status, etaMinutes, patch) =>
    set((s) => {
      const apply = (o: ActiveOrder): ActiveOrder => ({
        ...o,
        status,
        ...(etaMinutes != null && { etaMinutes }),
        ...(patch?.formattedOrderId ? { formattedOrderId: patch.formattedOrderId } : {}),
        ...(patch?.storeName ? { storeName: patch.storeName } : {}),
      });
      return {
        activeOrder: s.activeOrder?.orderId === orderId ? apply(s.activeOrder) : s.activeOrder,
        activeOrders: s.activeOrders.map((o) => (o.orderId === orderId ? apply(o) : o)),
      };
    }),

  showPrepDelayBanner: (orderId, message, durationMs = 20_000) =>
    set({
      prepDelayBanner: {
        orderId,
        message,
        expiresAt: Date.now() + durationMs,
      },
    }),

  clearPrepDelayBanner: () => set({ prepDelayBanner: null }),

  clearActiveOrder: () => set({ activeOrder: null, activeOrders: [], prepDelayBanner: null }),
}));
