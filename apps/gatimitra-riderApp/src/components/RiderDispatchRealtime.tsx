import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useDutyStore } from "@/src/stores/dutyStore";
import { getRiderAppConfig, resolveUrlForDevice } from "@/src/config/env";
import { ingestIncomingDispatchOffer, cancelIncomingDispatchOffer } from "@/src/lib/ingestIncomingDispatchOffer";
import { riderDispatchLog, riderDispatchWarn } from "@/src/lib/rider-dispatch-log";
import { acquireAndCommitRiderLocation } from "@/src/services/location/riderLocationController";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { pingLocation } from "@/src/services/location/locationPinger";
import { useRiderWsStore } from "@/src/stores/riderWsStore";
import { useRiderToastStore } from "@/src/stores/riderToastStore";
import { notifySessionRevoked } from "@/src/services/sessionEvents";
import {
  mergeEtaUpdatedEvent,
  RIDER_ORDER_ETA_QUERY_KEY,
  type OrderEtaResponse,
} from "@/src/services/api/etaApi";

const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const STALE_CONNECTION_MS = 75_000;
const GATEWAY_DOWN_LOG_COOLDOWN_MS = 120_000;

/** ws://host:4100 → http://host:4100/healthz */
function wsOriginToHealthUrl(wsOrigin: string): string {
  return `${wsOrigin.replace(/^ws(s)?:/i, "http$1:").replace(/\/+$/, "")}/healthz`;
}

async function isWsGatewayReachable(wsOrigin: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4_000);
    const res = await fetch(wsOriginToHealthUrl(wsOrigin), { signal: controller.signal });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

function parseRiderIdFromSession(userId: string | undefined): string | null {
  const m = userId?.match(/usr_(\d+)/);
  return m?.[1] ?? null;
}

/**
 * Subscribes to rider:{id} websocket events from ws-gateway.
 * Ingests dispatch_offer into the global offer store and refetches pending
 * offers so IncomingRideOrderHost does not depend on Home or GET /available GPS.
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
  const connectInFlightRef = useRef(false);
  const lastGatewayDownLogRef = useRef(0);
  const deviceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!getRiderAppConfig().wsEnabled) return;

    if (!hydrated || !session?.accessToken || session.role !== "rider" || !isOnDuty) {
      cancelledRef.current = true;
      connectGenRef.current += 1;
      useRiderWsStore.getState().setGatewayReachable(false);
      useRiderWsStore.getState().setSocketConnected(false);
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
    void getOrCreateDeviceId()
      .then((d) => {
        deviceIdRef.current = d;
      })
      .catch(() => {});

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
      if (cancelledRef.current || connectInFlightRef.current) return;
      connectInFlightRef.current = true;
      const gen = ++connectGenRef.current;
      const { apiBaseUrl, wsBaseUrl } = getRiderAppConfig();
      const apiUrl = resolveUrlForDevice(apiBaseUrl);
      const wsOrigin = resolveUrlForDevice(wsBaseUrl);

      riderDispatchLog("WS CONNECTING", { reason, riderId });

      try {
        const gatewayUp = await isWsGatewayReachable(wsOrigin);
        useRiderWsStore.getState().setGatewayReachable(gatewayUp);
        if (!gatewayUp) {
          failureCountRef.current += 1;
          const now = Date.now();
          if (now - lastGatewayDownLogRef.current >= GATEWAY_DOWN_LOG_COOLDOWN_MS) {
            lastGatewayDownLogRef.current = now;
            riderDispatchWarn(
              "WS DISCONNECTED",
              { reason: "gateway_down", wsOrigin }
            );
          }
          scheduleReconnect("gateway_down");
          return;
        }

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
          let ticketError = "";
          try {
            const errJson = (await ticketRes.json()) as { error?: string; message?: string };
            ticketError = errJson.error ?? errJson.message ?? "";
          } catch {
            /* ignore */
          }
          riderDispatchWarn("ws ticket failed", { status: ticketRes.status, error: ticketError || undefined });
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
          useRiderWsStore.getState().setSocketConnected(true);
          touchActivity();
          startHeartbeat(ws);
          riderDispatchLog("WS CONNECTED", { riderId });
        };

        ws.onmessage = (event) => {
          touchActivity();
          try {
            const payload = JSON.parse(String(event.data)) as {
              type?: string;
              orderId?: string;
              reason?: string;
              estimatedEarning?: number;
              pricingEngine?: string;
              message?: string;
            };
            if (payload.type === "pong") return;
            // Instant single-device logout (§11, §27): the backend revoked THIS device after
            // a takeover from another device. Only react when the revoked deviceId is ours —
            // the new (active) device ignores its own event. The per-request 401 in
            // plugins/auth.ts remains the guaranteed fallback for offline/next-request cases.
            if (payload.type === "session.revoked") {
              const revokedDeviceId = (payload as { deviceId?: string }).deviceId;
              if (
                revokedDeviceId &&
                deviceIdRef.current &&
                revokedDeviceId === deviceIdRef.current
              ) {
                notifySessionRevoked({ reason: "device_takeover" });
              }
              return;
            }
            // P2 "wake + fresh ping": dispatch is about to offer an order to THIS rider and
            // wants a <2s-fresh location to price/route the pre-pickup leg. Capture GPS and
            // push it immediately; best-effort (dispatch falls back to the last point).
            if (payload.type === "location_wake") {
              void (async () => {
                try {
                  const result = await acquireAndCommitRiderLocation({
                    assumeReady: true,
                    requireFresh: true,
                  });
                  if (!result.ok) return;
                  const deviceId = await getOrCreateDeviceId();
                  await pingLocation({
                    session,
                    deviceId,
                    fix: {
                      tsMs: Date.now(),
                      lat: result.coords.latitude,
                      lng: result.coords.longitude,
                      accuracyM: result.coords.accuracy ?? undefined,
                    },
                  });
                } catch {
                  // Non-blocking — dispatch uses the existing (still-fresh) point on timeout.
                }
              })();
              return;
            }
            // Tracking watchdog warning (location off / wrong direction / no
            // movement). Backend re-emits at most every N min, so surface each
            // one directly — it warns the rider their order may be auto-cancelled.
            if (payload.type === "tracking.warning.v1" && payload.message) {
              useRiderToastStore.getState().showToast(String(payload.message));
              return;
            }
            if (payload.type === "eta.updated.v1" || payload.type === "eta.updated") {
              const orderKey = String(
                (payload as { orderIdText?: string; orderId?: string }).orderIdText ??
                  (payload as { orderId?: string }).orderId ??
                  ""
              ).trim();
              if (!orderKey) return;
              const prev = queryClient.getQueryData<OrderEtaResponse>(
                RIDER_ORDER_ETA_QUERY_KEY(orderKey)
              );
              const merged = mergeEtaUpdatedEvent(prev ?? null, payload as never);
              if (merged) {
                queryClient.setQueryData(RIDER_ORDER_ETA_QUERY_KEY(orderKey), merged);
                queryClient.setQueryData(RIDER_ORDER_ETA_QUERY_KEY(orderKey.toUpperCase()), merged);
              }
              return;
            }
            if (
              payload.type === "dispatch_offer" ||
              payload.type === "incoming_order" ||
              payload.type === "force_assignment_offer"
            ) {
              riderDispatchLog("REALTIME EVENT RECEIVED", {
                type: payload.type,
                orderId: payload.orderId,
                estimatedEarning: payload.estimatedEarning,
                pricingEngine: payload.pricingEngine,
              });
              ingestIncomingDispatchOffer(
                queryClient,
                payload.orderId,
                payload.type ?? "dispatch_offer"
              );
              return;
            }
            if (
              payload.type === "dispatch_offer_cancelled" ||
              payload.type === "dispatch_offer_withdrawn"
            ) {
              const oid = String(
                payload.orderId ??
                  payload.order_id ??
                  payload.offerId ??
                  payload.offer_id ??
                  ""
              ).trim();
              riderDispatchLog("REALTIME EVENT RECEIVED", {
                type: payload.type,
                orderId: oid,
                reason: payload.reason,
              });
              cancelIncomingDispatchOffer(queryClient, oid, String(payload.type), {
                reason: String(payload.reason ?? payload.type ?? ""),
              });
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
          useRiderWsStore.getState().setSocketConnected(false);
          if (wsRef.current === ws) wsRef.current = null;
          riderDispatchLog("WS DISCONNECTED", { code: event.code, reason: event.reason });
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
      } finally {
        connectInFlightRef.current = false;
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
