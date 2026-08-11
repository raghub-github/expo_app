/**
 * Merchant order-detail ETA — subscribe to `eta.updated.v1` on order:{id}.
 * Renders only server stageAware; version-gates stale frames.
 */
import { useEffect, useRef } from "react";
import { getConfig } from "@/config/env";
import { isAppForeground, subscribeAppForeground } from "@/lib/appForeground";
import { perfAuditMark } from "@/lib/perfAuditLog";
import {
  mergeEtaUpdatedEvent,
  type OrderEtaResponse,
} from "@/services/etaApi";

function orderIdsForWsTicket(ids: string[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = String(raw ?? "")
      .trim()
      .toUpperCase();
    if (/^[A-Z0-9-]{4,32}$/.test(id)) out.push(id);
  }
  return Array.from(new Set(out)).slice(0, 20);
}

export function useOrderEtaRealtime(args: {
  enabled: boolean;
  orderIdText: string | null | undefined;
  token: string | null;
  eta: OrderEtaResponse | null;
  setEta: (next: OrderEtaResponse | null) => void;
  /** Refetch HTTP ETA after foreground resume (closes WS gap while backgrounded). */
  onResume?: () => void | Promise<void>;
}) {
  const { enabled, orderIdText, token, eta, setEta, onResume } = args;
  const etaRef = useRef(eta);
  etaRef.current = eta;
  const setEtaRef = useRef(setEta);
  setEtaRef.current = setEta;
  const onResumeRef = useRef(onResume);
  onResumeRef.current = onResume;

  useEffect(() => {
    const { wsEnabled, apiBaseUrl, wsBaseUrl } = getConfig();
    const ids = orderIdsForWsTicket(orderIdText ? [orderIdText] : []);
    if (!enabled || !wsEnabled || !token || ids.length === 0) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let failure = 0;
    let foreground = isAppForeground();

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const pauseWs = () => {
      clearReconnect();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
      perfAuditMark("order_eta.ws_paused");
    };

    const scheduleReconnect = () => {
      if (cancelled || !foreground) return;
      clearReconnect();
      failure += 1;
      const delay = Math.min(2000 * 2 ** failure, 60_000);
      perfAuditMark("order_eta.ws_reconnect_scheduled");
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delay);
    };

    const connect = async () => {
      if (cancelled || !foreground) return;
      try {
        const ticketRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/ws-ticket`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ orderIds: ids }),
        });
        if (!ticketRes.ok || cancelled || !foreground) {
          scheduleReconnect();
          return;
        }
        const json = (await ticketRes.json()) as { ticket?: string };
        if (!json.ticket || cancelled || !foreground) return;

        pauseWs();
        ws = new WebSocket(`${wsBaseUrl}/v1/ws?ticket=${encodeURIComponent(json.ticket)}`);
        perfAuditMark("order_eta.ws_connect");
        ws.onopen = () => {
          failure = 0;
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
            if (msg.type === "pong") return;
            if (msg.type !== "eta.updated.v1" && msg.type !== "eta.updated") return;
            const merged = mergeEtaUpdatedEvent(etaRef.current, msg as never);
            if (merged) setEtaRef.current(merged);
          } catch {
            /* ignore */
          }
        };
        ws.onclose = () => {
          ws = null;
          if (cancelled || !foreground) return;
          scheduleReconnect();
        };
      } catch {
        if (!cancelled && foreground) scheduleReconnect();
      }
    };

    let prevForeground = foreground;

    const unsubForeground = subscribeAppForeground((active) => {
      const resumed = !prevForeground && active;
      prevForeground = active;
      foreground = active;
      if (!active) {
        pauseWs();
        return;
      }
      failure = 0;
      if (resumed) {
        perfAuditMark("order_eta.ws_resumed");
        void onResumeRef.current?.();
      }
      void connect();
    });

    return () => {
      cancelled = true;
      unsubForeground();
      pauseWs();
    };
  }, [enabled, orderIdText, token]);
}
