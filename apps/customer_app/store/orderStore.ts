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
  updateOrderStatus: (orderId: string, status: OrderStatus, etaMinutes?: number) => void;
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
      const exists = s.activeOrders.some((o) => o.orderId === order.orderId);
      const activeOrders = exists ? s.activeOrders.map((o) => (o.orderId === order.orderId ? order : o)) : [...s.activeOrders, order];
      return { activeOrder: order, activeOrders };
    }),

  addActiveOrder: (order) =>
    set((s) => {
      const exists = s.activeOrders.some((o) => o.orderId === order.orderId);
      const next = exists ? s.activeOrders.map((o) => (o.orderId === order.orderId ? order : o)) : [...s.activeOrders, order];
      return { activeOrder: order, activeOrders: next };
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

  updateOrderStatus: (orderId, status, etaMinutes) =>
    set((s) => ({
      activeOrder: s.activeOrder?.orderId === orderId ? { ...s.activeOrder, status, ...(etaMinutes != null && { etaMinutes }) } : s.activeOrder,
      activeOrders: s.activeOrders.map((o) =>
        o.orderId === orderId ? { ...o, status, ...(etaMinutes != null && { etaMinutes }) } : o
      ),
    })),

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
