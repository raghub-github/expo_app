/**
 * Board / realtime reconciliation for GLOBAL order termination (Guarantee B).
 *
 * When ANY surface (another phone, Admin, Partner Website, timeout) moves an
 * order out of CREATED, stop that order's alert on THIS device — even if the
 * Incoming sheet is closed and the buzzer was already locally muted.
 *
 * This must never publish a mute preference or touch other devices' audio settings.
 */
import { useEffect, useRef } from "react";
import { useOrdersContext } from "@/context/OrdersContext";
import {
  applyGlobalOrderAlertStop,
  getNewOrderAlertSession,
  hasLocalNewOrderAlertSession,
} from "@/lib/newOrderAlertManager";
import { getActiveNativeOrderAlert } from "@gatimitra/expo-push-kit";
import { isIncomingOrderResolved } from "@/lib/incomingOrderDismissed";

function stopReasonForStatus(status: string | null | undefined): "accepted" | "rejected" | "expired" {
  const s = String(status ?? "").toLowerCase();
  if (s === "rejected" || s === "cancelled") return "rejected";
  if (s === "expired") return "expired";
  return "accepted";
}

export default function GlobalOrderAlertStopSync() {
  const { orders } = useOrdersContext();
  const seenTerminal = useRef<Set<string>>(new Set());
  const nativeOrderIdRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const active = await getActiveNativeOrderAlert();
        if (!cancelled) {
          nativeOrderIdRef.current = String(active?.orderId ?? active?.offerId ?? "").trim();
        }
      } catch {
        /* native optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orders]);

  useEffect(() => {
    const jsSession = getNewOrderAlertSession();
    const jsOrderId = String(jsSession?.orderId ?? "").trim();
    const jsLive =
      jsSession != null &&
      (jsSession.state === "playing" || jsSession.state === "queued");
    const nativeOrderId = nativeOrderIdRef.current;

    const maybeStop = (key: string, status: string | null | undefined) => {
      if (!key || seenTerminal.current.has(key)) return;
      seenTerminal.current.add(key);
      void applyGlobalOrderAlertStop(key, stopReasonForStatus(status));
    };

    // Reconnect / missed FCM: if native or JS still owns an order that is no
    // longer CREATED on the board (or missing), terminate that alert locally.
    for (const ownedId of [nativeOrderId, jsLive ? jsOrderId : ""]) {
      if (!ownedId) continue;
      const row = orders.find((o) => String(o.id) === ownedId);
      if (!row || row.status !== "created") {
        maybeStop(ownedId, row?.status ?? "accepted");
      }
    }

    for (const order of orders) {
      if (!order?.id || order.id.startsWith("core-")) continue;
      if (order.status === "created") continue;

      const key = String(order.id);
      const watched =
        (jsLive && key === jsOrderId) ||
        key === nativeOrderId ||
        hasLocalNewOrderAlertSession(key) ||
        isIncomingOrderResolved(order.ordersCoreId, key);
      if (!watched) continue;
      maybeStop(key, order.status);
    }

    if (seenTerminal.current.size > 80) {
      seenTerminal.current = new Set([...seenTerminal.current].slice(-40));
    }
  }, [orders]);

  return null;
}
