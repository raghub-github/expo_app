/**
 * Realtime order status – subscribe to order_status_changes so UI updates < 1s.
 * When Supabase (or WebSocket) is configured, subscribe to channel; else poll active order.
 */

import { useEffect, useRef } from "react";
import { useOrderStore } from "@/store/orderStore";
import { orderService } from "@/services/order.service";

const POLL_INTERVAL_MS = 5000;

export function useOrderRealtime() {
  const activeOrder = useOrderStore((s) => s.activeOrder);
  const updateStatus = useOrderStore((s) => s.updateStatus);
  const clearActiveOrder = useOrderStore((s) => s.clearActiveOrder);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeOrder?.orderId) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    const fetchAndSync = async () => {
      try {
        const detail = await orderService.getOrder(activeOrder.orderId);
        const status = (detail?.status ?? "").toUpperCase();
        if (status === "DELIVERED" || status === "CANCELLED") {
          clearActiveOrder();
          return;
        }
        const eta =
          status === "OUT_FOR_DELIVERY" || status === "ON_THE_WAY"
            ? 15
            : status === "PICKED_UP"
              ? 20
              : 27;
        updateStatus(status as import("@/store/orderStore").OrderStatus, eta);
      } catch {
        // keep current state
      }
    };

    fetchAndSync();
    pollRef.current = setInterval(fetchAndSync, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [activeOrder?.orderId, updateStatus, clearActiveOrder]);

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
