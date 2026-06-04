import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { getRiderAppConfig, resolveUrlForDevice } from "@/src/config/env";
import { RIDER_AVAILABLE_ORDERS_QUERY_KEY } from "@/src/hooks/useOrders";

const MAX_WS_FAILURES = 4;
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 120_000;

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
  const failureCountRef = useRef(0);
  const wsDisabledRef = useRef(false);

  useEffect(() => {
    if (!getRiderAppConfig().wsEnabled) return;

    if (!hydrated || !session?.accessToken || session.role !== "rider" || !isOnDuty) {
      wsRef.current?.close();
      wsRef.current = null;
      failureCountRef.current = 0;
      wsDisabledRef.current = false;
      return;
    }

    const riderId =
      session.riderId?.trim() ||
      parseRiderIdFromSession(session.userId);
    if (!riderId) return;

    let cancelled = false;

    const scheduleReconnect = () => {
      if (cancelled || wsDisabledRef.current) return;
      const failures = failureCountRef.current;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** failures, RECONNECT_MAX_MS);
      reconnectTimer.current = setTimeout(() => void connect(), delay);
    };

    const connect = async () => {
      if (cancelled || wsDisabledRef.current) return;
      const { apiBaseUrl, wsBaseUrl } = getRiderAppConfig();
      const apiUrl = resolveUrlForDevice(apiBaseUrl);
      const wsOrigin = resolveUrlForDevice(wsBaseUrl);

      try {
        const ticketRes = await fetch(`${apiUrl}/v1/auth/ws-ticket`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${session.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ riderId }),
        });
        if (!ticketRes.ok || cancelled) {
          failureCountRef.current += 1;
          scheduleReconnect();
          return;
        }
        const ticketJson = (await ticketRes.json()) as { ticket?: string };
        if (!ticketJson.ticket || cancelled) {
          failureCountRef.current += 1;
          scheduleReconnect();
          return;
        }

        const wsUrl = `${wsOrigin}/v1/ws?ticket=${encodeURIComponent(ticketJson.ticket)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          failureCountRef.current = 0;
        };

        ws.onmessage = (event) => {
          try {
            const payload = JSON.parse(String(event.data)) as { type?: string };
            if (payload.type === "dispatch_offer" || payload.type === "incoming_order") {
              void queryClient.invalidateQueries({ queryKey: RIDER_AVAILABLE_ORDERS_QUERY_KEY });
            }
          } catch {
            /* ignore malformed frames */
          }
        };

        ws.onerror = () => {
          failureCountRef.current += 1;
          if (failureCountRef.current >= MAX_WS_FAILURES) {
            wsDisabledRef.current = true;
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          if (!cancelled && !wsDisabledRef.current) {
            scheduleReconnect();
          }
        };
      } catch {
        failureCountRef.current += 1;
        if (failureCountRef.current >= MAX_WS_FAILURES) {
          wsDisabledRef.current = true;
        } else if (!cancelled) {
          scheduleReconnect();
        }
      }
    };

    void connect();

    const onAppState = (state: AppStateStatus) => {
      if (state === "active" && !wsRef.current && !wsDisabledRef.current) {
        failureCountRef.current = 0;
        void connect();
      }
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      cancelled = true;
      sub.remove();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [hydrated, session?.accessToken, session?.role, session?.userId, session?.riderId, isOnDuty, queryClient]);

  return null;
}
