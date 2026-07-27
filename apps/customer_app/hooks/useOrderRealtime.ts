/**
 * Realtime order status + rider location for active orders.
 *
 * Location transport:
 *   1. WebSocket `rider.location.updated.v1` is PRIMARY when ws-gateway is up
 *   2. HTTP GET /tracking is automatic FALLBACK only while WS is disconnected
 *
 * On app resume: reconnect WS immediately + one-shot HTTP location fetch,
 * then animate from the last on-screen position (map lerp — no teleport).
 *
 * GPS samples pass through riderGpsFilter (accuracy + impossible-jump).
 * Stale / out-of-order samples are rejected via updatedAt timestamps.
 */

import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useOrderStore } from "@/store/orderStore";
import { useAuthStore } from "@/store/authStore";
import { orderService, type OrderTrackingResponse } from "@/services/order.service";
import { etaService } from "@/services/eta.service";
import { buildPrepDelayMessage, resolveLiveEtaMinutes } from "@/lib/order-eta-display";
import { getConfig } from "@/config/env";
import {
  noteLiveLocationUpdate,
  resetLiveLocationHealth,
  setLiveLocationReconnecting,
  setLiveLocationWsConnected,
} from "@/lib/liveLocationTransport";
import {
  clearRiderGpsFilterState,
  filterRiderGpsSample,
} from "@/lib/riderGpsFilter";

const STATUS_POLL_INTERVAL_MS = 5_000;
const LOCATION_FALLBACK_POLL_MS = 2_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const STALE_CONNECTION_MS = 75_000;

type TrackingRider = NonNullable<OrderTrackingResponse["rider"]>;

/** Ticket mint allows A-Z0-9- only (see backend ws-ticket.routes). */
function orderIdsForWsTicket(orderIds: string[]): string[] {
  const out: string[] = [];
  for (const raw of orderIds) {
    const id = String(raw ?? "")
      .trim()
      .toUpperCase();
    if (/^[A-Z0-9-]{4,32}$/.test(id)) out.push(id);
  }
  return Array.from(new Set(out)).slice(0, 20);
}

function riderUpdatedAtMs(rider: { updatedAt?: string } | null | undefined): number {
  if (!rider?.updatedAt) return 0;
  const ms = Date.parse(rider.updatedAt);
  return Number.isFinite(ms) ? ms : 0;
}

function applyAcceptedRider(
  queryClient: ReturnType<typeof useQueryClient>,
  orderIds: string | string[],
  rider: TrackingRider,
  lastAcceptedMs: Map<string, number>,
  transport: "ws" | "http"
): boolean {
  const ids = (Array.isArray(orderIds) ? orderIds : [orderIds])
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
  if (ids.length === 0) return false;

  const filtered = filterRiderGpsSample(ids, {
    latitude: rider.latitude,
    longitude: rider.longitude,
    headingDegrees: rider.headingDegrees,
    accuracyMeters: rider.accuracyMeters ?? null,
    speedMps: rider.speedMps ?? null,
    updatedAt: rider.updatedAt,
  });
  if (!filtered.accept) {
    if (__DEV__) {
      console.log("[live-track] drop GPS sample", { orderIds: ids, reason: filtered.reason });
    }
    return false;
  }

  const nextRider: TrackingRider = {
    latitude: filtered.sample.latitude,
    longitude: filtered.sample.longitude,
    headingDegrees: filtered.headingTrusted ? filtered.sample.headingDegrees ?? null : null,
    updatedAt: filtered.sample.updatedAt,
    accuracyMeters: filtered.sample.accuracyMeters ?? null,
    speedMps: filtered.sample.speedMps ?? null,
  };

  const nextMs = riderUpdatedAtMs(nextRider);
  const idSet = new Set(ids.map((id) => id.toUpperCase()));

  let newestKnown = 0;
  for (const id of idSet) {
    newestKnown = Math.max(newestKnown, lastAcceptedMs.get(id) ?? 0);
  }
  for (const orderId of ids) {
    const cached = queryClient.getQueryData<OrderTrackingResponse>(["orderTracking", orderId]);
    newestKnown = Math.max(newestKnown, riderUpdatedAtMs(cached?.rider));
  }

  if (nextMs > 0 && newestKnown > 0 && nextMs < newestKnown) {
    if (__DEV__) {
      console.log("[live-track] drop stale GPS", { orderIds: ids, nextMs, newestKnown });
    }
    return false;
  }

  for (const orderId of ids) {
    queryClient.setQueryData<OrderTrackingResponse>(["orderTracking", orderId], (prev) => ({
      orderId: prev?.orderId ?? orderId,
      rider: nextRider,
    }));
    lastAcceptedMs.set(orderId.toUpperCase(), nextMs > 0 ? nextMs : Date.now());
  }

  queryClient.setQueriesData<OrderTrackingResponse>(
    {
      predicate: (q) => {
        if (!Array.isArray(q.queryKey) || q.queryKey[0] !== "orderTracking") return false;
        const keyId = String(q.queryKey[1] ?? "").trim();
        return keyId.length > 0 && idSet.has(keyId.toUpperCase());
      },
    },
    (prev) => ({
      orderId: prev?.orderId ?? ids[0]!,
      rider: nextRider,
    })
  );

  noteLiveLocationUpdate(transport);
  return true;
}

function clearTrackingForOrders(
  queryClient: ReturnType<typeof useQueryClient>,
  orderIds: string[],
  lastAcceptedMs: Map<string, number>
) {
  const cleaned = orderIds.map((id) => String(id).trim()).filter(Boolean);
  for (const orderId of cleaned) {
    lastAcceptedMs.delete(orderId.toUpperCase());
    queryClient.removeQueries({ queryKey: ["orderTracking", orderId] });
  }
  clearRiderGpsFilterState(cleaned);
}

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

type RiderLocationWsEvent = {
  type?: string;
  orderIdText?: string;
  orderId?: string;
  riderId?: number;
  lat?: number;
  lng?: number;
  headingDegrees?: number | null;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  updatedAt?: string;
  at?: string;
};

export function useOrderRealtime() {
  const queryClient = useQueryClient();
  const activeOrders = useOrderStore((s) => s.activeOrders);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const removeActiveOrder = useOrderStore((s) => s.removeActiveOrder);
  const showPrepDelayBanner = useOrderStore((s) => s.showPrepDelayBanner);
  const session = useAuthStore((s) => s.session);
  const authHydrated = useAuthStore((s) => s.hydrated);

  const statusPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEtaReasonRef = useRef<Record<string, string>>({});
  const lastAcceptedMsRef = useRef<Map<string, number>>(new Map());
  const wsConnectedRef = useRef(false);
  const prevActiveIdsRef = useRef<string>("");
  const fetchLatestLocationRef = useRef<(() => Promise<void>) | null>(null);
  const reconnectNowRef = useRef<((reason: string) => void) | null>(null);

  const orderIds = Array.from(
    new Set(
      activeOrders
        .filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED")
        .flatMap((o) =>
          [o.orderId, o.formattedOrderId].filter((v): v is string => Boolean(v?.trim()))
        )
    )
  );

  const pollOrderIds = Array.from(
    new Set(
      activeOrders
        .filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED")
        .map((o) => o.orderId)
        .filter((v): v is string => Boolean(v?.trim()))
    )
  );

  const activeKey = pollOrderIds.join(",");

  // Drop tracking listeners / cache when orders leave the active set.
  useEffect(() => {
    const prev = prevActiveIdsRef.current;
    prevActiveIdsRef.current = activeKey;
    if (!prev) return;
    const prevIds = prev.split(",").filter(Boolean);
    const nextSet = new Set(pollOrderIds);
    const removed = prevIds.filter((id) => !nextSet.has(id));
    if (removed.length > 0) {
      clearTrackingForOrders(queryClient, removed, lastAcceptedMsRef.current);
      if (__DEV__) {
        console.log("[live-track] cleanup completed orders", { removed });
      }
    }
    if (pollOrderIds.length === 0) {
      lastAcceptedMsRef.current.clear();
      clearRiderGpsFilterState();
      resetLiveLocationHealth();
    }
  }, [activeKey, pollOrderIds, queryClient]);

  // ── REST: status + ETA (always). Location only when WS is down. ───────────
  useEffect(() => {
    if (pollOrderIds.length === 0) {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
      if (locationPollRef.current) {
        clearInterval(locationPollRef.current);
        locationPollRef.current = null;
      }
      fetchLatestLocationRef.current = null;
      setLiveLocationWsConnected(false);
      wsConnectedRef.current = false;
      return;
    }

    const { wsEnabled } = getConfig();

    const syncStatus = async () => {
      await Promise.all(
        pollOrderIds.map(async (orderId) => {
          try {
            const [detail, eta] = await Promise.all([
              orderService.getOrder(orderId),
              etaService.getForOrder(orderId),
            ]);

            const status = (detail?.status ?? "").toUpperCase();
            if (status === "DELIVERED" || status === "CANCELLED") {
              removeActiveOrder(orderId);
              clearTrackingForOrders(
                queryClient,
                [orderId, detail?.formattedOrderId].filter(
                  (v): v is string => typeof v === "string" && v.trim().length > 0
                ),
                lastAcceptedMsRef.current
              );
              void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
              return;
            }
            const etaMins = resolveLiveEtaMinutes(eta);
            const orderType = String(detail?.orderType ?? "").trim().toLowerCase();
            const serviceType =
              orderType === "person_ride" || orderType === "ride"
                ? ("ride" as const)
                : orderType === "parcel"
                  ? ("parcel" as const)
                  : ("food" as const);
            updateOrderStatus(
              orderId,
              status as import("@/store/orderStore").OrderStatus,
              etaMins ?? undefined,
              {
                formattedOrderId: detail?.formattedOrderId ?? null,
                storeName: detail?.merchantPublicName ?? detail?.merchantName ?? null,
                serviceType,
              }
            );

            // Keep React Query order cache in sync so Captain Card / rider profile
            // appear as soon as assignment lands — independent of map/WS/GPS.
            if (detail) {
              queryClient.setQueryData(["order", orderId], detail);
              if (detail.formattedOrderId && detail.formattedOrderId !== orderId) {
                queryClient.setQueryData(["order", detail.formattedOrderId], detail);
              }
            }

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

    const syncLocationOnce = async () => {
      await Promise.all(
        pollOrderIds.map(async (orderId) => {
          try {
            const tracking = await orderService.getOrderTracking(orderId);
            if (!tracking?.rider) return;
            const detail = queryClient.getQueryData<{
              formattedOrderId?: string | null;
              orderId?: string;
            }>(["order", orderId]);
            const trackingIds = [orderId, detail?.formattedOrderId, detail?.orderId].filter(
              (v): v is string => typeof v === "string" && v.trim().length > 0
            );
            applyAcceptedRider(
              queryClient,
              trackingIds,
              tracking.rider,
              lastAcceptedMsRef.current,
              "http"
            );
          } catch {
            /* ignore */
          }
        })
      );
    };

    const syncLocationFallback = async () => {
      if (wsEnabled && wsConnectedRef.current) return;
      await syncLocationOnce();
    };

    fetchLatestLocationRef.current = syncLocationOnce;

    void syncStatus();
    void syncLocationFallback();

    statusPollRef.current = setInterval(syncStatus, STATUS_POLL_INTERVAL_MS);
    locationPollRef.current = setInterval(syncLocationFallback, LOCATION_FALLBACK_POLL_MS);

    return () => {
      if (statusPollRef.current) {
        clearInterval(statusPollRef.current);
        statusPollRef.current = null;
      }
      if (locationPollRef.current) {
        clearInterval(locationPollRef.current);
        locationPollRef.current = null;
      }
      fetchLatestLocationRef.current = null;
    };
  }, [activeKey, updateOrderStatus, removeActiveOrder, showPrepDelayBanner, queryClient]);

  // ── WebSocket: primary rider.location.updated.v1 ─────────────────────────
  useEffect(() => {
    const { wsEnabled, apiBaseUrl, wsBaseUrl } = getConfig();
    const ticketOrderIds = orderIdsForWsTicket(orderIds);

    const markWs = (connected: boolean) => {
      wsConnectedRef.current = connected;
      setLiveLocationWsConnected(connected);
      if (connected) setLiveLocationReconnecting(false);
    };

    if (!wsEnabled || !authHydrated || !session?.accessToken || ticketOrderIds.length === 0) {
      markWs(false);
      reconnectNowRef.current = null;
      return;
    }

    let cancelled = false;
    let connectGen = 0;
    let connectInFlight = false;
    let failureCount = 0;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let lastActivity = Date.now();
    let backgroundedAtMs: number | null = null;

    const clearHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const startHeartbeat = (socket: WebSocket) => {
      clearHeartbeat();
      heartbeatTimer = setInterval(() => {
        if (cancelled || socket.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastActivity >= STALE_CONNECTION_MS) {
          markWs(false);
          setLiveLocationReconnecting(true);
          try {
            socket.close();
          } catch {
            /* ignore */
          }
          return;
        }
        try {
          socket.send(JSON.stringify({ type: "ping" }));
        } catch {
          /* ignore */
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    const scheduleReconnect = (reason: string) => {
      if (cancelled) return;
      markWs(false);
      setLiveLocationReconnecting(true);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** failureCount, RECONNECT_MAX_MS);
      reconnectTimer = setTimeout(() => void connect(`backoff:${reason}`), delay);
    };

    const applyLocationEvent = (payload: RiderLocationWsEvent) => {
      if (payload.type !== "rider.location.updated.v1") return;
      const lat = Number(payload.lat);
      const lng = Number(payload.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const orderKey = String(payload.orderIdText ?? payload.orderId ?? "").trim();
      if (!orderKey) return;
      const rider: TrackingRider = {
        latitude: lat,
        longitude: lng,
        headingDegrees:
          payload.headingDegrees != null && Number.isFinite(Number(payload.headingDegrees))
            ? Number(payload.headingDegrees)
            : null,
        accuracyMeters:
          payload.accuracyMeters != null && Number.isFinite(Number(payload.accuracyMeters))
            ? Number(payload.accuracyMeters)
            : null,
        speedMps:
          payload.speedMps != null && Number.isFinite(Number(payload.speedMps))
            ? Number(payload.speedMps)
            : null,
        updatedAt: payload.updatedAt ?? payload.at ?? new Date().toISOString(),
      };
      applyAcceptedRider(
        queryClient,
        [orderKey, ...orderIds],
        rider,
        lastAcceptedMsRef.current,
        "ws"
      );
    };

    const connect = async (reason: string) => {
      if (cancelled || connectInFlight) return;
      connectInFlight = true;
      const gen = ++connectGen;
      setLiveLocationReconnecting(true);
      try {
        const gatewayUp = await isWsGatewayReachable(wsBaseUrl);
        if (!gatewayUp) {
          failureCount += 1;
          scheduleReconnect("gateway_down");
          return;
        }

        const ticketRes = await fetch(`${apiBaseUrl}/v1/auth/ws-ticket`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${session.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ orderIds: ticketOrderIds }),
        });

        if (!ticketRes.ok || cancelled || gen !== connectGen) {
          failureCount += 1;
          scheduleReconnect("ticket_failed");
          return;
        }

        const ticketJson = (await ticketRes.json()) as { ticket?: string };
        if (!ticketJson.ticket || cancelled || gen !== connectGen) {
          failureCount += 1;
          scheduleReconnect("ticket_missing");
          return;
        }

        try {
          ws?.close();
        } catch {
          /* ignore */
        }

        ws = new WebSocket(`${wsBaseUrl}/v1/ws?ticket=${encodeURIComponent(ticketJson.ticket)}`);

        ws.onopen = () => {
          if (cancelled || gen !== connectGen) {
            ws?.close();
            return;
          }
          failureCount = 0;
          lastActivity = Date.now();
          markWs(true);
          if (ws) startHeartbeat(ws);
          if (__DEV__) {
            console.log("[live-track] customer ws open", { reason, orderIds: ticketOrderIds });
          }
        };

        ws.onmessage = (event) => {
          lastActivity = Date.now();
          try {
            const payload = JSON.parse(String(event.data)) as RiderLocationWsEvent;
            applyLocationEvent(payload);
          } catch {
            /* ignore malformed frames */
          }
        };

        ws.onclose = () => {
          clearHeartbeat();
          markWs(false);
          if (cancelled || gen !== connectGen) return;
          failureCount += 1;
          scheduleReconnect("closed");
        };

        ws.onerror = () => {
          markWs(false);
          failureCount += 1;
        };
      } finally {
        connectInFlight = false;
      }
    };

    reconnectNowRef.current = (reason: string) => {
      failureCount = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      void connect(reason);
    };

    void connect("mount");

    const appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "background" || state === "inactive") {
        backgroundedAtMs = Date.now();
        return;
      }
      if (state !== "active" || cancelled) return;

      const awayMs = backgroundedAtMs != null ? Date.now() - backgroundedAtMs : 0;
      backgroundedAtMs = null;

      // Immediate reconnect + one-shot latest fix after any resume (esp. 5–10+ min).
      setLiveLocationReconnecting(true);
      failureCount = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      void connect(awayMs >= 60_000 ? "resume_long" : "foreground");
      void fetchLatestLocationRef.current?.();

      if (__DEV__) {
        console.log("[live-track] app resume", { awayMs });
      }
    });

    return () => {
      cancelled = true;
      connectGen += 1;
      appStateSub.remove();
      reconnectNowRef.current = null;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      clearHeartbeat();
      markWs(false);
      setLiveLocationReconnecting(false);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      ws = null;
    };
  }, [orderIds.join(","), authHydrated, session?.accessToken, queryClient]);
}
