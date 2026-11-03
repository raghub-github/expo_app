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
import { AppState } from "react-native";
import { useOrdersContext } from "@/context/OrdersContext";
import {
  applyGlobalOrderAlertStop,
  getNewOrderAlertSession,
  hasLocalNewOrderAlertSession,
} from "@/lib/newOrderAlertManager";
import { getActiveNativeOrderAlert } from "@gatimitra/expo-push-kit";
import { isIncomingOrderResolved } from "@/lib/incomingOrderDismissed";

function stopReasonForStatus(status: string | null | undefined): "accepted" | "rejected" | "expired" {
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "rejected" || s === "cancelled") return "rejected";
  if (s === "expired") return "expired";
  return "accepted";
}

function isNumericOrderKey(value: string): boolean {
  return /^\d+$/.test(value);
}

function tokenFromSession(sid: string): string {
  if (!sid) return "";
  const parts = sid.split(":");
  if (parts[0] === "MERCHANT_NEW_ORDER" && parts[1]) return parts[1];
  if (parts[0] === "RIDER_NEW_ORDER" && parts[1]) return parts[1];
  if (sid.startsWith("merchant-order-")) return sid.slice("merchant-order-".length);
  if (sid.startsWith("rider-offer-")) return sid.slice("rider-offer-".length);
  return "";
}

/**
 * Board rows key on numeric orders_food.id. Prefer that over GMF/display text
 * so GlobalOrderAlertStopSync can match CREATED → terminal transitions.
 */
function nativeOwnedOrderKey(active: {
  orderId?: string;
  offerId?: string;
  sessionId?: string;
} | null): string {
  if (!active) return "";
  const fromSession = tokenFromSession(String(active.sessionId ?? "").trim());
  if (fromSession && isNumericOrderKey(fromSession)) return fromSession;
  const direct = String(active.orderId ?? active.offerId ?? "").trim();
  if (direct && isNumericOrderKey(direct)) return direct;
  if (fromSession) return fromSession;
  return direct;
}

export default function GlobalOrderAlertStopSync() {
  const { orders } = useOrdersContext();
  const seenTerminal = useRef<Set<string>>(new Set());
  const nativeOrderIdRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    const refreshNative = async () => {
      try {
        const active = await getActiveNativeOrderAlert();
        if (!cancelled) nativeOrderIdRef.current = nativeOwnedOrderKey(active);
      } catch {
        /* native optional */
      }
    };
    void refreshNative();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshNative();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [orders]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      // Re-read native ownership on every board change — do not trust a stale ref
      // when Partner Website accepted while this phone stayed in background.
      try {
        const active = await getActiveNativeOrderAlert();
        if (!cancelled) nativeOrderIdRef.current = nativeOwnedOrderKey(active);
      } catch {
        /* ignore */
      }
      if (cancelled) return;

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
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [orders]);

  return null;
}
