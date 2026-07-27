/**
 * Merchant live rider location — WebSocket primary (same event as customer),
 * HTTP fallback while disconnected. Slow HTTP refresh keeps ETA/approach fresh
 * even when WS is connected.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { filterRiderGpsSample } from "@gatimitra/map-tracking-engine";
import { getConfig } from "@/config/env";
import {
  fetchMerchantRiderTracking,
  MERCHANT_RIDER_TRACKING_POLL_MS,
  type MerchantRiderTrackingPayload,
} from "@/services/riderTrackingApi";

const HEARTBEAT_INTERVAL_MS = 20_000;
const STALE_CONNECTION_MS = 75_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
/** Approach / rider profile refresh while WS owns the marker position. */
const APPROACH_REFRESH_MS = 15_000;

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

function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function withClientApproach(
  payload: MerchantRiderTrackingPayload
): MerchantRiderTrackingPayload {
  // Prefer server approach/ETA from HTTP. On WS location patches we only refresh
  // remaining distance so Customer and Merchant ETAs stay aligned.
  if (!payload.location || !payload.store) return payload;
  const remaining_distance_m = Math.round(
    haversineMeters(payload.location, payload.store)
  );
  if (!payload.approach) {
    return {
      ...payload,
      approach: {
        remaining_distance_m,
        eta_minutes: Math.max(1, Math.round(remaining_distance_m / 1000 / 0.35)),
        source: "straight_line",
      },
    };
  }
  return {
    ...payload,
    approach: {
      ...payload.approach,
      remaining_distance_m,
    },
  };
}

type Props = {
  enabled: boolean;
  storeId: number | null;
  ordersFoodId: number | null;
  /** Public order ids for WS ticket (formattedOrderId / order_id). */
  wsOrderIds: string[];
  token: string | null;
  onLocationPatch?: (payload: MerchantRiderTrackingPayload) => void;
};

export function useMerchantRiderLiveTracking({
  enabled,
  storeId,
  ordersFoodId,
  wsOrderIds,
  token,
  onLocationPatch,
}: Props): {
  data: MerchantRiderTrackingPayload | null;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
  reload: (silent?: boolean) => Promise<void>;
} {
  const [data, setData] = useState<MerchantRiderTrackingPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const wsConnectedRef = useRef(false);
  const dataRef = useRef<MerchantRiderTrackingPayload | null>(null);
  const onPatchRef = useRef(onLocationPatch);
  onPatchRef.current = onLocationPatch;
  const ticketKey = useMemo(() => orderIdsForWsTicket(wsOrderIds).join("|"), [wsOrderIds]);
  const ticketIds = useMemo(() => orderIdsForWsTicket(wsOrderIds), [ticketKey]);

  const applyPayload = useCallback((payload: MerchantRiderTrackingPayload) => {
    const next = withClientApproach(payload);
    dataRef.current = next;
    setData(next);
    onPatchRef.current?.(next);
  }, []);

  const reload = useCallback(
    async (silent = true) => {
      if (!enabled || !storeId || !token || ordersFoodId == null) return;
      if (!silent) setLoading(true);
      try {
        const payload = await fetchMerchantRiderTracking(storeId, ordersFoodId, token);
        applyPayload(payload);
        setError(null);
      } catch (e) {
        if (!silent) {
          setError(e instanceof Error ? e.message : "Could not load rider location");
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [enabled, storeId, token, ordersFoodId, applyPayload]
  );

  // Bootstrap + HTTP fallback (fast when WS down) + approach refresh (when WS up)
  useEffect(() => {
    if (!enabled || !storeId || !token || ordersFoodId == null) {
      setData(null);
      dataRef.current = null;
      setWsConnected(false);
      wsConnectedRef.current = false;
      return;
    }

    void reload(false);
    const id = setInterval(() => {
      if (wsConnectedRef.current) return;
      void reload(true);
    }, MERCHANT_RIDER_TRACKING_POLL_MS);
    const approachId = setInterval(() => {
      if (!wsConnectedRef.current) return;
      void reload(true);
    }, APPROACH_REFRESH_MS);

    return () => {
      clearInterval(id);
      clearInterval(approachId);
    };
  }, [enabled, storeId, token, ordersFoodId, reload]);

  // WebSocket primary
  useEffect(() => {
    if (!enabled || !token || ticketIds.length === 0) return;
    const { wsEnabled, wsBaseUrl, apiBaseUrl } = getConfig();
    if (!wsEnabled) return;

    let closed = false;
    let ws: WebSocket | null = null;
    let heartbeatId: ReturnType<typeof setInterval> | null = null;
    let staleId: ReturnType<typeof setInterval> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;
    let lastMessageAt = Date.now();
    const clearTimers = () => {
      if (heartbeatId) clearInterval(heartbeatId);
      if (staleId) clearInterval(staleId);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      heartbeatId = null;
      staleId = null;
      reconnectTimer = null;
    };

    const markDisconnected = () => {
      wsConnectedRef.current = false;
      setWsConnected(false);
    };

    const scheduleReconnect = () => {
      if (closed) return;
      clearTimers();
      markDisconnected();
      const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** reconnectAttempt);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        void connect();
      }, delay);
    };

    const applyWsLocation = (msg: Record<string, unknown>) => {
      const lat = Number(msg.lat);
      const lng = Number(msg.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const updatedAt =
        typeof msg.updatedAt === "string" ? msg.updatedAt : new Date().toISOString();
      const heading =
        msg.headingDegrees != null && Number.isFinite(Number(msg.headingDegrees))
          ? Number(msg.headingDegrees)
          : null;
      const accuracy =
        msg.accuracyMeters != null && Number.isFinite(Number(msg.accuracyMeters))
          ? Number(msg.accuracyMeters)
          : null;
      const speed =
        msg.speedMps != null && Number.isFinite(Number(msg.speedMps))
          ? Number(msg.speedMps)
          : null;

      const filtered = filterRiderGpsSample(ticketIds, {
        latitude: lat,
        longitude: lng,
        headingDegrees: heading,
        accuracyMeters: accuracy,
        speedMps: speed,
        updatedAt,
      });
      if (!filtered.accept) return;

      const prev = dataRef.current;
      if (!prev) {
        void reload(true);
        return;
      }
      const next: MerchantRiderTrackingPayload = {
        ...prev,
        location: {
          latitude: filtered.sample.latitude,
          longitude: filtered.sample.longitude,
          heading_degrees: filtered.sample.headingDegrees ?? prev.location?.heading_degrees ?? null,
          updated_at: filtered.sample.updatedAt ?? updatedAt,
          source: "live_location",
        },
      };
      applyPayload(next);
    };

    const connect = async () => {
      if (closed) return;
      try {
        const ticketRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/ws-ticket`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ orderIds: ticketIds }),
        });
        if (!ticketRes.ok) {
          scheduleReconnect();
          return;
        }
        const ticketJson = (await ticketRes.json()) as { ticket?: string };
        const ticket = ticketJson.ticket?.trim();
        if (!ticket) {
          scheduleReconnect();
          return;
        }

        const url = `${wsBaseUrl.replace(/\/+$/, "")}/v1/ws?ticket=${encodeURIComponent(ticket)}`;
        ws = new WebSocket(url);

        ws.onopen = () => {
          if (closed) return;
          reconnectAttempt = 0;
          lastMessageAt = Date.now();
          wsConnectedRef.current = true;
          setWsConnected(true);
          heartbeatId = setInterval(() => {
            try {
              ws?.send(JSON.stringify({ type: "ping" }));
            } catch {
              /* ignore */
            }
          }, HEARTBEAT_INTERVAL_MS);
          staleId = setInterval(() => {
            if (Date.now() - lastMessageAt > STALE_CONNECTION_MS) {
              try {
                ws?.close();
              } catch {
                /* ignore */
              }
            }
          }, 15_000);
        };

        ws.onmessage = (ev) => {
          lastMessageAt = Date.now();
          try {
            const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
            if (msg.type === "pong" || msg.type === "ping") return;
            if (msg.type === "rider.location.updated.v1") {
              applyWsLocation(msg);
            }
          } catch {
            /* ignore malformed */
          }
        };

        ws.onerror = () => {
          scheduleReconnect();
        };
        ws.onclose = () => {
          scheduleReconnect();
        };
      } catch {
        scheduleReconnect();
      }
    };

    void connect();

    const onAppState = (next: AppStateStatus) => {
      if (next === "active") {
        reconnectAttempt = 0;
        void reload(true);
        try {
          ws?.close();
        } catch {
          /* reconnect via onclose */
        }
      }
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      closed = true;
      clearTimers();
      markDisconnected();
      sub.remove();
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    };
  }, [enabled, token, ticketKey, ticketIds, reload, applyPayload]);

  return { data, loading, error, wsConnected, reload };
}
