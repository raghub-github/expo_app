/**
 * Realtime order status – poll all active orders so UI updates quickly.
 * When WebSocket/SSE is configured, subscribe per order; else poll (max delay ~2s).
 */

import { useEffect, useRef } from "react";
import { useOrderStore } from "@/store/orderStore";
import { orderService } from "@/services/order.service";

const POLL_INTERVAL_MS = 2500;

export function useOrderRealtime() {
  const activeOrders = useOrderStore((s) => s.activeOrders);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const removeActiveOrder = useOrderStore((s) => s.removeActiveOrder);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const orderIds = activeOrders
    .filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED")
    .map((o) => o.orderId);

  useEffect(() => {
    if (orderIds.length === 0) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const fetchAndSync = async () => {
      await Promise.all(
        orderIds.map(async (orderId) => {
          try {
            const detail = await orderService.getOrder(orderId);
            const status = (detail?.status ?? "").toUpperCase();
            if (status === "DELIVERED" || status === "CANCELLED") {
              removeActiveOrder(orderId);
              return;
            }
            const eta =
              status === "OUT_FOR_DELIVERY" || status === "ON_THE_WAY"
                ? 15
                : status === "PICKED_UP"
                  ? 20
                  : 27;
            updateOrderStatus(orderId, status as import("@/store/orderStore").OrderStatus, eta);
          } catch {
            // keep current state
          }
        })
      );
    };

    fetchAndSync();
    pollRef.current = setInterval(fetchAndSync, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [orderIds.join(","), updateOrderStatus, removeActiveOrder]);

  // TODO: When Supabase realtime is enabled, subscribe to order_status_changes
  // and call updateStatus/clearActiveOrder on payload instead of polling.
  // const { supabaseUrl, supabaseAnonKey } = getConfig();
  // if (supabaseUrl && supabaseAnonKey && activeOrder?.orderId) {
  //   const channel = supabase.channel(`order:${activeOrder.orderId}`)
  //     .on('broadcast', { event: 'status' }, ({ payload }) => { ... })
  //     .subscribe();
  //   return () => { supabase.removeChannel(channel); };
  // }
}
