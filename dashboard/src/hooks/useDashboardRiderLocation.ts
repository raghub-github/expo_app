"use client";

/**
 * Admin live rider GPS — same Redis → ws-gateway engine as customer / merchant /
 * partner / rider apps (`rider.location.updated.v1` on `order:{GMF…}`).
 * Ticket mint goes through same-origin `/api/auth/ws-ticket` (cookie JWT → backend).
 */
import { useEffect, useRef, useState } from "react";
import {
  clearRiderGpsFilterState,
  filterRiderGpsSample,
} from "@/lib/map/rider-gps-filter";
import { resolveDashboardWsBaseUrl } from "@/lib/realtime/resolve-ws-base-url";

export type DashboardRiderLiveFix = {
  latitude: number;
  longitude: number;
  headingDegrees: number | null;
  accuracyMeters: number | null;
  speedMps: number | null;
  updatedAt: string;
  riderId: number | null;
};

type WsLocationMsg = {
  type?: string;
  riderId?: number | string;
  lat?: number;
  lng?: number;
  headingDegrees?: number | null;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  updatedAt?: string;
  orderIdText?: string;
  orderId?: string;
};

function normalizeOrderChannelId(value: string | null | undefined): string | null {
  const id = String(value ?? "")
    .trim()
    .toUpperCase();
  if (!id || !/^[A-Z0-9-]{4,32}$/.test(id)) return null;
  return id;
}

export function useDashboardRiderLocation(opts: {
  orderIdText: string | null | undefined;
  /** Extra channel ids (e.g. raw order_id + GMF…) so ticket matches backend publish. */
  channelOrderIds?: Array<string | null | undefined>;
  enabled?: boolean;
}) {
  const { orderIdText, channelOrderIds, enabled = true } = opts;
  const [liveFix, setLiveFix] = useState<DashboardRiderLiveFix | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const liveFixRef = useRef<DashboardRiderLiveFix | null>(null);

  useEffect(() => {
    liveFixRef.current = liveFix;
  }, [liveFix]);

  useEffect(() => {
    const primary = normalizeOrderChannelId(orderIdText);
    const extras = (channelOrderIds ?? [])
      .map((id) => normalizeOrderChannelId(id))
      .filter((id): id is string => Boolean(id));
    const ticketIds = Array.from(new Set([...(primary ? [primary] : []), ...extras]));

    if (!enabled || ticketIds.length === 0) {
      setWsConnected(false);
      return;
    }

    const wsBase = resolveDashboardWsBaseUrl();
    if (!wsBase) {
      setWsConnected(false);
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    let attempt = 0;

    clearRiderGpsFilterState(ticketIds);

    const clearHeartbeat = () => {
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const applyMsg = (msg: WsLocationMsg) => {
      if (msg.type !== "rider.location.updated.v1") return;
      const lat = Number(msg.lat);
      const lng = Number(msg.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const updatedAt =
        typeof msg.updatedAt === "string" && msg.updatedAt.trim()
          ? msg.updatedAt
          : new Date().toISOString();

      const filtered = filterRiderGpsSample(ticketIds, {
        latitude: lat,
        longitude: lng,
        headingDegrees:
          msg.headingDegrees != null && Number.isFinite(Number(msg.headingDegrees))
            ? Number(msg.headingDegrees)
            : null,
        accuracyMeters:
          msg.accuracyMeters != null && Number.isFinite(Number(msg.accuracyMeters))
            ? Number(msg.accuracyMeters)
            : null,
        speedMps:
          msg.speedMps != null && Number.isFinite(Number(msg.speedMps))
            ? Number(msg.speedMps)
            : null,
        updatedAt,
      });
      if (!filtered.accept) return;

      const prev = liveFixRef.current;
      const prevMs = prev ? Date.parse(prev.updatedAt) : 0;
      const nextMs = Date.parse(filtered.sample.updatedAt);
      if (Number.isFinite(prevMs) && Number.isFinite(nextMs) && nextMs < prevMs) return;

      const next: DashboardRiderLiveFix = {
        latitude: filtered.sample.latitude,
        longitude: filtered.sample.longitude,
        headingDegrees:
          filtered.headingTrusted && filtered.sample.headingDegrees != null
            ? Number(filtered.sample.headingDegrees)
            : filtered.sample.headingDegrees ?? prev?.headingDegrees ?? null,
        accuracyMeters: filtered.sample.accuracyMeters ?? null,
        speedMps: filtered.sample.speedMps ?? null,
        updatedAt: filtered.sample.updatedAt,
        riderId:
          msg.riderId != null && Number.isFinite(Number(msg.riderId))
            ? Number(msg.riderId)
            : prev?.riderId ?? null,
      };
      liveFixRef.current = next;
      setLiveFix(next);
    };

    const connect = async () => {
      if (cancelled) return;
      try {
        const ticketRes = await fetch("/api/auth/ws-ticket", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ orderIds: ticketIds }),
        });
        if (!ticketRes.ok || cancelled) {
          setWsConnected(false);
          if (ticketRes.status === 401 || ticketRes.status === 403) {
            attempt = Math.max(attempt, 8);
          }
          scheduleReconnect(ticketRes.status === 401 || ticketRes.status === 403 ? 60_000 : undefined);
          return;
        }
        const { ticket } = (await ticketRes.json()) as { ticket?: string };
        if (!ticket?.trim() || cancelled) {
          setWsConnected(false);
          scheduleReconnect();
          return;
        }

        ws = new WebSocket(`${wsBase}/v1/ws?ticket=${encodeURIComponent(ticket.trim())}`);
        ws.onopen = () => {
          if (cancelled) return;
          attempt = 0;
          setWsConnected(true);
          clearHeartbeat();
          heartbeatTimer = setInterval(() => {
            try {
              ws?.send(JSON.stringify({ type: "ping" }));
            } catch {
              /* ignore */
            }
          }, 25_000);
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as WsLocationMsg;
            if (msg.type === "pong" || msg.type === "ping") return;
            applyMsg(msg);
          } catch {
            /* ignore */
          }
        };
        ws.onerror = () => {
          /* onclose handles reconnect */
        };
        ws.onclose = () => {
          setWsConnected(false);
          clearHeartbeat();
          if (!cancelled) scheduleReconnect();
        };
      } catch {
        setWsConnected(false);
        scheduleReconnect();
      }
    };

    const scheduleReconnect = (minDelayMs?: number) => {
      if (cancelled || reconnectTimer) return;
      const delay = Math.max(
        minDelayMs ?? 0,
        Math.min(60_000, 2_000 * Math.pow(1.6, attempt))
      );
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        void connect();
      }, delay);
    };

    void connect();

    return () => {
      cancelled = true;
      clearHeartbeat();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
      clearRiderGpsFilterState(ticketIds);
      setWsConnected(false);
    };
  }, [orderIdText, enabled, channelOrderIds?.join("|")]);

  return { liveFix, wsConnected };
}
