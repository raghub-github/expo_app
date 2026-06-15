import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { getRiderAppConfig, resolveUrlForDevice } from "@/src/config/env";
import { RIDER_AVAILABLE_ORDERS_QUERY_KEY } from "@/src/hooks/useOrders";
import { showAcceptedByAnotherRiderToast } from "@/src/lib/riderDispatchTakenToast";
import { riderDispatchLog, riderDispatchWarn } from "@/src/lib/rider-dispatch-log";

const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const STALE_CONNECTION_MS = 75_000;

function parseRiderIdFromSession(userId: string | undefined): string | null {
  const m = userId?.match(/usr_(\d+)/);
  return m?.[1] ?? null;
}

/**
 * Subscribes to rider:{id} websocket events from ws-gateway.
 * Invalidates the available-orders query on dispatch_offer — same engine result
 * set as push notifications and the incoming order modal.
 */
export function RiderDispatchRealtime() {
  const queryClient = useQueryClient();
  const session = useSessionStore((s) => s.session);
  const hydrated = useSessionStore((s) => s.hydrated);
  const isOnDuty = useDutyStore((s) => s.isOnDuty);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const failureCountRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const cancelledRef = useRef(false);
  const connectGenRef = useRef(0);

  useEffect(() => {
    if (!getRiderAppConfig().wsEnabled) return;

    if (!hydrated || !session?.accessToken || session.role !== "rider" || !isOnDuty) {
      cancelledRef.current = true;
      connectGenRef.current += 1;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      failureCountRef.current = 0;
      return;
    }

    const riderId =
      session.riderId?.trim() ||
      parseRiderIdFromSession(session.userId);
    if (!riderId) return;

    cancelledRef.current = false;
    const accessToken = session.accessToken;

    const clearHeartbeat = () => {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
    };

    const touchActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const startHeartbeat = (ws: WebSocket) => {
      clearHeartbeat();
      heartbeatTimer.current = setInterval(() => {
        if (cancelledRef.current) return;
        if (ws.readyState !== WebSocket.OPEN) return;

        const idleMs = Date.now() - lastActivityRef.current;
        if (idleMs >= STALE_CONNECTION_MS) {
          riderDispatchWarn("ws stale — forcing reconnect", { idleMs });
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          return;
        }

        try {
          ws.send(JSON.stringify({ type: "ping" }));
        } catch {
          riderDispatchWarn("ws heartbeat send failed");
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    const scheduleReconnect = (reason: string) => {
      if (cancelledRef.current) return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const failures = failureCountRef.current;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** failures, RECONNECT_MAX_MS);
      riderDispatchLog(`ws reconnect scheduled in ${delay}ms (${reason})`);
      reconnectTimer.current = setTimeout(() => void connect(`backoff:${reason}`), delay);
    };

    const forceReconnect = (reason: string) => {
      if (cancelledRef.current) return;
      riderDispatchLog(`ws force reconnect (${reason})`);
      failureCountRef.current = 0;
      connectGenRef.current += 1;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      clearHeartbeat();
      const existing = wsRef.current;
      wsRef.current = null;
      try {
        existing?.close();
      } catch {
        /* ignore */
      }
      void connect(`force:${reason}`);
    };

    const connect = async (reason: string) => {
      if (cancelledRef.current) return;
      const gen = ++connectGenRef.current;
      const { apiBaseUrl, wsBaseUrl } = getRiderAppConfig();
      const apiUrl = resolveUrlForDevice(apiBaseUrl);
      const wsOrigin = resolveUrlForDevice(wsBaseUrl);

      riderDispatchLog(`ws connect attempt (${reason})`);

      try {
        const ticketRes = await fetch(`${apiUrl}/v1/auth/ws-ticket`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ riderId }),
        });
        if (!ticketRes.ok || cancelledRef.current || gen !== connectGenRef.current) {
          failureCountRef.current += 1;
          riderDispatchWarn("ws ticket failed", { status: ticketRes.status });
          scheduleReconnect("ticket_failed");
          return;
        }
        const ticketJson = (await ticketRes.json()) as { ticket?: string };
        if (!ticketJson.ticket || cancelledRef.current || gen !== connectGenRef.current) {
          failureCountRef.current += 1;
          scheduleReconnect("ticket_missing");
          return;
        }

        const wsUrl = `${wsOrigin}/v1/ws?ticket=${encodeURIComponent(ticketJson.ticket)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelledRef.current || gen !== connectGenRef.current) {
            ws.close();
            return;
          }
          failureCountRef.current = 0;
          touchActivity();
          startHeartbeat(ws);
          riderDispatchLog("ws connected");
        };

        ws.onmessage = (event) => {
          touchActivity();
          try {
            const payload = JSON.parse(String(event.data)) as {
              type?: string;
              orderId?: string;
              reason?: string;
            };
            if (payload.type === "pong") return;
            if (payload.type === "dispatch_offer" || payload.type === "incoming_order") {
              riderDispatchLog("dispatch event received", payload.type);
              void queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
            }
            if (
              payload.type === "dispatch_offer_withdrawn" &&
              payload.reason === "accepted_by_other_rider" &&
              payload.orderId
            ) {
              void queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
              showAcceptedByAnotherRiderToast(String(payload.orderId));
            }
          } catch {
            /* ignore malformed frames */
          }
        };

        ws.onerror = () => {
          failureCountRef.current += 1;
          riderDispatchWarn("ws error");
        };

        ws.onclose = (event) => {
          clearHeartbeat();
          if (wsRef.current === ws) wsRef.current = null;
          riderDispatchLog("ws closed", { code: event.code, reason: event.reason });
          if (!cancelledRef.current && gen === connectGenRef.current) {
            scheduleReconnect("closed");
          }
        };
      } catch (err) {
        failureCountRef.current += 1;
        riderDispatchWarn("ws connect exception", err);
        if (!cancelledRef.current) {
          scheduleReconnect("exception");
        }
      }
    };

    void connect("initial");

    const onAppState = (state: AppStateStatus) => {
      if (state !== "active" || cancelledRef.current) return;
      const ws = wsRef.current;
      const needsReconnect =
        !ws || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED;
      if (needsReconnect) {
        forceReconnect("app_foreground");
      } else {
        touchActivity();
      }
      void queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      cancelledRef.current = true;
      connectGenRef.current += 1;
      sub.remove();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      clearHeartbeat();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [hydrated, session?.accessToken, session?.role, session?.userId, session?.riderId, isOnDuty, queryClient]);

  return null;
}
