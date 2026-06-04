/**
 * Realtime order status – poll all active orders so UI updates quickly.
 * When WebSocket/SSE is configured, subscribe per order; else poll (max delay ~2s).
 */

import { useEffect, useRef } from "react";
import { useOrderStore } from "@/store/orderStore";
import { orderService } from "@/services/order.service";
import { etaService } from "@/services/eta.service";
import { buildPrepDelayMessage, resolveLiveEtaMinutes } from "@/lib/order-eta-display";

const POLL_INTERVAL_MS = 1200;

export function useOrderRealtime() {
  const activeOrders = useOrderStore((s) => s.activeOrders);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const removeActiveOrder = useOrderStore((s) => s.removeActiveOrder);
  const showPrepDelayBanner = useOrderStore((s) => s.showPrepDelayBanner);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEtaReasonRef = useRef<Record<string, string>>({});

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
            const [detail, eta] = await Promise.all([
              orderService.getOrder(orderId),
              etaService.getForOrder(orderId),
            ]);
            const status = (detail?.status ?? "").toUpperCase();
            if (status === "DELIVERED" || status === "CANCELLED") {
              removeActiveOrder(orderId);
              return;
            }
            const etaMins = resolveLiveEtaMinutes(eta) ?? 25;
            updateOrderStatus(orderId, status as import("@/store/orderStore").OrderStatus, etaMins);

            const liveReason = eta?.live?.reason ?? "";
            const prevReason = lastEtaReasonRef.current[orderId] ?? "";
            if (liveReason === "MERCHANT_DELAY" && prevReason !== "MERCHANT_DELAY") {
              const liveCreated = eta?.live?.createdAt ? new Date(eta.live.createdAt).getTime() : 0;
              const isRecent = liveCreated > 0 && Date.now() - liveCreated < 120_000;
              if (isRecent) {
                const message = buildPrepDelayMessage(
                  5,
                  etaMins,
                  detail?.merchantPublicName ?? detail?.merchantName ?? null
                );
                showPrepDelayBanner(orderId, message, 20_000);
              }
            }
            lastEtaReasonRef.current[orderId] = liveReason;
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
  }, [orderIds.join(","), updateOrderStatus, removeActiveOrder, showPrepDelayBanner]);

  // TODO: When Supabase realtime is enabled, subscribe to order_status_changes
  // and call updateStatus/clearActiveOrder on payload instead of polling.
}
