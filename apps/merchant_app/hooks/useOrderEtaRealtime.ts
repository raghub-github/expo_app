/**
 * Merchant order-detail ETA — subscribe to `eta.updated.v1` on order:{id}.
 * Renders only server stageAware; version-gates stale frames.
 */
import { useEffect, useRef } from "react";
import { getConfig } from "@/config/env";
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
}) {
  const { enabled, orderIdText, token, eta, setEta } = args;
  const etaRef = useRef(eta);
  etaRef.current = eta;
  const setEtaRef = useRef(setEta);
  setEtaRef.current = setEta;

  useEffect(() => {
    const { wsEnabled, apiBaseUrl, wsBaseUrl } = getConfig();
    const ids = orderIdsForWsTicket(orderIdText ? [orderIdText] : []);
    if (!enabled || !wsEnabled || !token || ids.length === 0) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let failure = 0;

    const connect = async () => {
      if (cancelled) return;
      try {
        const ticketRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/ws-ticket`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ orderIds: ids }),
        });
        if (!ticketRes.ok || cancelled) {
          failure += 1;
          reconnectTimer = setTimeout(connect, Math.min(2000 * 2 ** failure, 60_000));
          return;
        }
        const json = (await ticketRes.json()) as { ticket?: string };
        if (!json.ticket || cancelled) return;

        ws = new WebSocket(`${wsBaseUrl}/v1/ws?ticket=${encodeURIComponent(json.ticket)}`);
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
          if (cancelled) return;
          failure += 1;
          reconnectTimer = setTimeout(connect, Math.min(2000 * 2 ** failure, 60_000));
        };
      } catch {
        if (!cancelled) {
          failure += 1;
          reconnectTimer = setTimeout(connect, Math.min(2000 * 2 ** failure, 60_000));
        }
      }
    };

    void connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [enabled, orderIdText, token]);
}
