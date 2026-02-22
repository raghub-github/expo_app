/**
 * Active order state – after place order, cart transforms into "Track Live" until delivered.
 * Status flow: ORDER_PLACED → PREPARING → PICKED_UP → OUT_FOR_DELIVERY → DELIVERED.
 * Realtime can push updates here; UI shows live order button instead of cart when active.
 */

import { create } from "zustand";

export type OrderStatus =
  | "ORDER_PLACED"
  | "PREPARING"
  | "PICKED_UP"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

export type ActiveOrder = {
  orderId: string;
  status: OrderStatus;
  etaMinutes: number;
  storeId: string | null;
  storeName: string | null;
  placedAt: number;
};

type OrderState = {
  activeOrder: ActiveOrder | null;
  setActiveOrder: (order: ActiveOrder | null) => void;
  updateStatus: (status: OrderStatus, etaMinutes?: number) => void;
  clearActiveOrder: () => void;
};

export const useOrderStore = create<OrderState>((set) => ({
  activeOrder: null,

  setActiveOrder: (order) => set({ activeOrder: order }),

  updateStatus: (status, etaMinutes) =>
    set((s) =>
      s.activeOrder
        ? {
            activeOrder: {
              ...s.activeOrder,
              status,
              ...(etaMinutes != null && { etaMinutes }),
            },
          }
        : s
    ),

  clearActiveOrder: () => set({ activeOrder: null }),
}));
