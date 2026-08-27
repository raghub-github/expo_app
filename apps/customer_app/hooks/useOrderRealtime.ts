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

import { useEffect, useMemo, useRef } from "react";
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
import {
  applyEtaUpdatedToQueryCache,
  isEtaUpdatedEvent,
  type EtaUpdatedWsEvent,
} from "@/lib/applyEtaUpdatedEvent";

/**
 * Poll cadence is transport-aware. The WebSocket pushes rider location and ETA,
 * but NOT order status transitions (ACCEPTED → PREPARING → PICKED_UP), so status
 * polling can never be switched off entirely — only slowed down and slimmed:
 * while the socket is healthy we skip the per-order ETA request (it arrives as
 * `eta.updated.v1`) and halve the frequency. That takes an active food order
 * from 24 req/min to 6 req/min without changing status latency materially.
 */
const STATUS_POLL_INTERVAL_MS = 5_000;
/** Keep status snappy even with WS — ready / accept must not wait 10s+. */
const STATUS_POLL_INTERVAL_WS_HEALTHY_MS = 5_000;
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

  // `nextRider` is written by reference to every key, so subscribers comparing
  // by identity see one change per frame rather than one per alias.
  for (const orderId of ids) {
    queryClient.setQueryData<OrderTrackingResponse>(["orderTracking", orderId], (prev) => {
      if (prev?.rider === nextRider) return prev;
      return { orderId: prev?.orderId ?? orderId, rider: nextRider };
    });
    lastAcceptedMs.set(orderId.toUpperCase(), nextMs > 0 ? nextMs : Date.now());
  }

  // Cover case-normalised aliases (the backend sometimes echoes a lower-cased
  // id) directly instead of via `setQueriesData`, whose predicate walked the
  // ENTIRE query cache on every GPS frame — up to 1 Hz, cost growing with cache
  // size, for a set of keys we already know by name.
  for (const upperId of idSet) {
    if (ids.includes(upperId)) continue;
    queryClient.setQueryData<OrderTrackingResponse>(["orderTracking", upperId], (prev) => {
      if (prev === undefined) return prev; // never materialise a key nobody subscribed to
      if (prev.rider === nextRider) return prev;
      return { orderId: prev.orderId ?? upperId, rider: nextRider };
    });
  }

  noteLiveLocationUpdate(transport);
  return true;
}

function httpStatusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: number; response?: { status?: number } };
  const n = e.status ?? e.response?.status;
  return typeof n === "number" ? n : undefined;
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

  const lastEtaReasonRef = useRef<Record<string, string>>({});
  const lastPrepMinutesRef = useRef<Record<string, number>>({});
  const lastAcceptedMsRef = useRef<Map<string, number>>(new Map());
  const lastEtaVersionRef = useRef<Map<string, number>>(new Map());
  const wsConnectedRef = useRef(false);
  const prevActiveIdsRef = useRef<string>("");
  const fetchLatestLocationRef = useRef<(() => Promise<void>) | null>(null);
  const syncStatusRef = useRef<(() => Promise<void>) | null>(null);
  const reconnectNowRef = useRef<((reason: string) => void) | null>(null);

  // Both arrays were rebuilt on every render and then used directly as effect
  // dependencies, so the cleanup effect below re-ran on every render of the root
  // layout. Memoising on the *content* key keeps identity stable across renders
  // that did not actually change the active order set.
  const liveOrders = useMemo(
    () => activeOrders.filter((o) => o.status !== "DELIVERED" && o.status !== "CANCELLED"),
    [activeOrders]
  );

  const orderIds = useMemo(
    () =>
      Array.from(
        new Set(
          liveOrders.flatMap((o) =>
            [o.orderId, o.formattedOrderId].filter((v): v is string => Boolean(v?.trim()))
          )
        )
      ),
    [liveOrders]
  );

  const pollOrderIds = useMemo(
    () =>
      Array.from(
        new Set(
          liveOrders.map((o) => o.orderId).filter((v): v is string => Boolean(v?.trim()))
        )
      ),
    [liveOrders]
  );

  const activeKey = pollOrderIds.join(",");
  const wsTicketKey = orderIds.join(",");

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
      fetchLatestLocationRef.current = null;
      syncStatusRef.current = null;
      setLiveLocationWsConnected(false);
      wsConnectedRef.current = false;
      return;
    }

    const { wsEnabled } = getConfig();

    const syncStatus = async () => {
      // While the socket is healthy, ETA arrives as `eta.updated.v1` — skipping
      // the REST ETA call here halves the request count with no added latency.
      const skipEtaFetch = wsEnabled && wsConnectedRef.current;
      await Promise.all(
        pollOrderIds.map(async (orderId) => {
          try {
            const [detail, eta] = await Promise.all([
              orderService.getOrder(orderId),
              skipEtaFetch ? Promise.resolve(null) : etaService.getForOrder(orderId),
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
              const { refreshCustomerWallet } = await import("@/lib/refreshCustomerWallet");
              void refreshCustomerWallet(queryClient);
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
              // Keep My Orders Active badges live (not only on 15s refetch / terminal).
              queryClient.setQueryData(
                ["my-orders"],
                (prev: import("@/services/order.service").OrderSummary[] | undefined) => {
                  if (!Array.isArray(prev)) return prev;
                  let changed = false;
                  const next = prev.map((row) => {
                    const same =
                      row.orderId === orderId ||
                      row.orderId === detail.orderId ||
                      (detail.formattedOrderId &&
                        (row.orderId === detail.formattedOrderId ||
                          row.formattedOrderId === detail.formattedOrderId));
                    if (!same) return row;
                    if (row.status === detail.status) return row;
                    changed = true;
                    return { ...row, status: detail.status };
                  });
                  return changed ? next : prev;
                }
              );
            }

            if (eta) {
              queryClient.setQueryData(["orderEta", orderId], eta);
              if (detail?.formattedOrderId && detail.formattedOrderId !== orderId) {
                queryClient.setQueryData(["orderEta", detail.formattedOrderId], eta);
              }
              const v = Number(eta.stageAware?.etaVersion ?? 0);
              if (Number.isFinite(v) && v > 0) {
                lastEtaVersionRef.current.set(orderId.toUpperCase(), v);
                if (detail?.formattedOrderId) {
                  lastEtaVersionRef.current.set(detail.formattedOrderId.toUpperCase(), v);
                }
              }
            }

            // Only evaluate the prep-delay banner when this tick actually fetched
            // an ETA. Treating a skipped fetch as "reason cleared" would wipe the
            // remembered MERCHANT_DELAY and re-fire the banner on the next fetch.
            if (!skipEtaFetch) {
              const liveReason = eta?.live?.reason ?? "";
              const prevReason = lastEtaReasonRef.current[orderId] ?? "";
              if (liveReason === "MERCHANT_DELAY" && prevReason !== "MERCHANT_DELAY") {
                const liveCreated = eta?.live?.createdAt
                  ? new Date(eta.live.createdAt).getTime()
                  : 0;
                const isRecent = liveCreated > 0 && Date.now() - liveCreated < 120_000;
                if (isRecent) {
                  const prepMins =
                    eta?.prep?.minutes != null && Number.isFinite(eta.prep.minutes)
                      ? Number(eta.prep.minutes)
                      : null;
                  const prevPrep = lastPrepMinutesRef.current[orderId];
                  const delta =
                    prepMins != null &&
                    prevPrep != null &&
                    Number.isFinite(prevPrep) &&
                    prepMins > prevPrep
                      ? Math.round(prepMins - prevPrep)
                      : 5;
                  const extraMins = delta > 0 ? delta : 5;
                  const message = buildPrepDelayMessage(
                    extraMins,
                    etaMins,
                    detail?.merchantPublicName ?? detail?.merchantName ?? null
                  );
                  showPrepDelayBanner(orderId, message, 20_000, extraMins);
                }
              }
              lastEtaReasonRef.current[orderId] = liveReason;
              if (eta?.prep?.minutes != null && Number.isFinite(eta.prep.minutes)) {
                lastPrepMinutesRef.current[orderId] = Number(eta.prep.minutes);
              }
            }
          } catch (err) {
            if (httpStatusOf(err) === 404) {
              removeActiveOrder(orderId);
              clearTrackingForOrders(queryClient, [orderId], lastAcceptedMsRef.current);
            }
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
    syncStatusRef.current = syncStatus;

    // ── Scheduling ─────────────────────────────────────────────────────────
    // Self-rescheduling timeouts, not setInterval, for two reasons:
    //   1. the cadence has to adapt to WS health between ticks, and
    //   2. a slow request must not stack up behind the previous one.
    // Both loops stop entirely while the app is backgrounded — on Android JS
    // timers keep firing with the screen off, which is what let an active order
    // drain the battery in the user's pocket. `AppState` resume already triggers
    // an authoritative catch-up sync in the WebSocket effect below.
    let disposed = false;
    let statusTimer: ReturnType<typeof setTimeout> | null = null;
    let locationTimer: ReturnType<typeof setTimeout> | null = null;

    const isForeground = () => AppState.currentState === "active";

    const scheduleStatus = () => {
      if (disposed) return;
      const wsHealthy = wsEnabled && wsConnectedRef.current;
      const delay = wsHealthy ? STATUS_POLL_INTERVAL_WS_HEALTHY_MS : STATUS_POLL_INTERVAL_MS;
      statusTimer = setTimeout(async () => {
        if (disposed) return;
        if (isForeground()) await syncStatus();
        scheduleStatus();
      }, delay);
    };

    const scheduleLocation = () => {
      if (disposed) return;
      locationTimer = setTimeout(async () => {
        if (disposed) return;
        if (isForeground()) await syncLocationFallback();
        scheduleLocation();
      }, LOCATION_FALLBACK_POLL_MS);
    };

    void syncStatus();
    void syncLocationFallback();
    scheduleStatus();
    scheduleLocation();

    // Resume immediately on foreground instead of waiting out the pending tick.
    const pollAppStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (disposed || state !== "active") return;
      void syncStatus();
      void syncLocationFallback();
    });

    return () => {
      disposed = true;
      pollAppStateSub.remove();
      if (statusTimer) clearTimeout(statusTimer);
      if (locationTimer) clearTimeout(locationTimer);
      statusTimer = null;
      locationTimer = null;
      fetchLatestLocationRef.current = null;
      syncStatusRef.current = null;
    };
  }, [activeKey, pollOrderIds, updateOrderStatus, removeActiveOrder, showPrepDelayBanner, queryClient]);

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

    const applyStatusChangedEvent = (payload: {
      type?: string;
      orderId?: string | number;
      orderIdText?: string;
      status?: string;
    }) => {
      const t = String(payload.type ?? "").trim().toLowerCase();
      if (t !== "status_changed" && t !== "order.status_changed") return;
      const orderKey = String(payload.orderIdText ?? payload.orderId ?? "").trim();
      if (!orderKey) return;
      // Instant catch-up — don't wait for the 5s poll.
      void queryClient.invalidateQueries({ queryKey: ["order"] });
      void queryClient.invalidateQueries({ queryKey: ["orderEta"] });
      void queryClient.invalidateQueries({ queryKey: ["my-orders"] });
      void syncStatusRef.current?.();
    };

    const applyEtaEvent = (payload: EtaUpdatedWsEvent) => {
      if (!isEtaUpdatedEvent(payload)) return;
      const orderKey = String(payload.orderIdText ?? payload.orderId ?? "").trim();
      const accepted = applyEtaUpdatedToQueryCache(
        queryClient,
        [orderKey, ...orderIds, ...pollOrderIds],
        payload,
        lastEtaVersionRef.current
      );
      if (!accepted) return;

      void queryClient.invalidateQueries({ queryKey: ["orderEtaTimeline"] });

      // Ready / stage jumps must refresh order detail immediately (don't wait for poll).
      const stage = String(payload.stageAware?.currentStage ?? "").toUpperCase();
      if (
        stage === "READY_AWAITING_RIDER" ||
        stage === "RIDER_TO_MERCHANT" ||
        stage === "AT_STORE" ||
        stage === "CUSTOMER_DELIVERY" ||
        stage === "ARRIVING" ||
        stage === "DELIVERED"
      ) {
        void queryClient.invalidateQueries({ queryKey: ["order"] });
        void syncStatusRef.current?.();
      }

      const displayMins =
        payload.stageAware?.displayEta ??
        payload.customer?.etaMinutes ??
        null;

      const matching = useOrderStore.getState().activeOrders.filter((o) => {
        const keys = [o.orderId, o.formattedOrderId]
          .filter((x): x is string => Boolean(x?.trim()))
          .map((x) => x.toUpperCase());
        if (!orderKey) return true;
        return keys.includes(orderKey.toUpperCase());
      });

      for (const o of matching) {
        if (displayMins != null) {
          updateOrderStatus(o.orderId, o.status, displayMins);
        }
      }

      const liveReason = payload.reason ?? "";
      if (liveReason === "MERCHANT_DELAY" && orderKey) {
        const prepMins =
          payload.prepMinutes != null && Number.isFinite(payload.prepMinutes)
            ? Number(payload.prepMinutes)
            : null;
        const prevPrep = lastPrepMinutesRef.current[orderKey];
        const delta =
          prepMins != null &&
          prevPrep != null &&
          Number.isFinite(prevPrep) &&
          prepMins > prevPrep
            ? Math.round(prepMins - prevPrep)
            : 5;
        const extraMins = delta > 0 ? delta : 5;
        const message = buildPrepDelayMessage(
          extraMins,
          displayMins,
          matching[0]?.storeName ?? null
        );
        showPrepDelayBanner(orderKey, message, 20_000, extraMins);
        if (prepMins != null) {
          lastPrepMinutesRef.current[orderKey] = prepMins;
        }
      } else if (
        orderKey &&
        payload.prepMinutes != null &&
        Number.isFinite(payload.prepMinutes)
      ) {
        lastPrepMinutesRef.current[orderKey] = Number(payload.prepMinutes);
      }
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
          // Catch up after reconnect — REST is authoritative if WS frames were missed.
          void queryClient.invalidateQueries({ queryKey: ["orderEta"] });
          void queryClient.invalidateQueries({ queryKey: ["orderEtaTimeline"] });
          void syncStatusRef.current?.();
          if (__DEV__) {
            console.log("[live-track] customer ws open", { reason, orderIds: ticketOrderIds });
          }
        };

        ws.onmessage = (event) => {
          lastActivity = Date.now();
          try {
            const payload = JSON.parse(String(event.data)) as RiderLocationWsEvent &
              EtaUpdatedWsEvent & {
                type?: string;
                orderId?: string | number;
                orderIdText?: string;
                status?: string;
              };
            if (payload.type === "pong") return;
            applyLocationEvent(payload);
            applyEtaEvent(payload);
            applyStatusChangedEvent(payload);
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

      // Immediate reconnect + authoritative ETA/status sync after any resume.
      setLiveLocationReconnecting(true);
      failureCount = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      void connect(awayMs >= 60_000 ? "resume_long" : "foreground");
      void fetchLatestLocationRef.current?.();
      void syncStatusRef.current?.();

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
  }, [wsTicketKey, orderIds, pollOrderIds, authHydrated, session?.accessToken, queryClient, updateOrderStatus, showPrepDelayBanner]);
}
