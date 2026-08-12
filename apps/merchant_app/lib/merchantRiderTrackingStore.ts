/**
 * Shared rider tracking sessions — one WebSocket + one poll pair per store/order.
 * Multiple UI surfaces (order card enrichment + tracking sheet) share the same session.
 */
import { filterRiderGpsSample } from "@gatimitra/map-tracking-engine";
import { getConfig } from "@/config/env";
import { isAppForeground, subscribeAppForeground } from "@/lib/appForeground";
import { perfAuditMark } from "@/lib/perfAuditLog";
import {
  fetchMerchantRiderTracking,
  MERCHANT_RIDER_TRACKING_POLL_MS,
  type MerchantRiderTrackingPayload,
} from "@/services/riderTrackingApi";

const HEARTBEAT_INTERVAL_MS = 20_000;
const STALE_CONNECTION_MS = 75_000;
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 60_000;
const APPROACH_REFRESH_MS = 15_000;

export type RiderTrackingSnapshot = {
  data: MerchantRiderTrackingPayload | null;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
};

type SessionKey = string;

type SubscriberHandle = {
  id: number;
  enabled: boolean;
  onLocationPatch?: (payload: MerchantRiderTrackingPayload) => void;
  onEtaUpdated?: (payload: Record<string, unknown>) => void;
};

type SessionConfig = {
  storeId: number;
  ordersFoodId: number;
  wsOrderIds: string[];
  token: string;
};

function sessionKey(cfg: SessionConfig): SessionKey {
  return `${cfg.storeId}:${cfg.ordersFoodId}`;
}

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

function withClientApproach(payload: MerchantRiderTrackingPayload): MerchantRiderTrackingPayload {
  if (!payload.location || !payload.store) return payload;
  const remaining_distance_m = Math.round(haversineMeters(payload.location, payload.store));
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

const EMPTY_SNAPSHOT: RiderTrackingSnapshot = {
  data: null,
  loading: false,
  error: null,
  wsConnected: false,
};

class RiderTrackingSession {
  readonly key: SessionKey;
  readonly config: SessionConfig;
  readonly ticketIds: string[];

  private subscribers = new Map<number, SubscriberHandle>();
  private snapshot: RiderTrackingSnapshot = { ...EMPTY_SNAPSHOT };
  private dataRef: MerchantRiderTrackingPayload | null = null;
  private wsConnectedRef = false;
  private notify: () => void = () => {};

  private pollId: ReturnType<typeof setInterval> | null = null;
  private approachId: ReturnType<typeof setInterval> | null = null;
  private ws: WebSocket | null = null;
  private heartbeatId: ReturnType<typeof setInterval> | null = null;
  private staleId: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private lastMessageAt = Date.now();
  private wsClosed = false;
  private running = false;
  private foregroundUnsub: (() => void) | null = null;

  constructor(key: SessionKey, config: SessionConfig) {
    this.key = key;
    this.config = config;
    this.ticketIds = orderIdsForWsTicket(config.wsOrderIds);
  }

  setNotifier(fn: () => void) {
    this.notify = fn;
  }

  getSnapshot(): RiderTrackingSnapshot {
    return this.snapshot;
  }

  addSubscriber(handle: SubscriberHandle) {
    this.subscribers.set(handle.id, handle);
    this.syncRuntime();
  }

  updateSubscriber(handle: SubscriberHandle) {
    this.subscribers.set(handle.id, handle);
    this.syncRuntime();
  }

  removeSubscriber(id: number) {
    this.subscribers.delete(id);
    this.syncRuntime();
  }

  hasEnabledSubscriber(): boolean {
    for (const s of this.subscribers.values()) {
      if (s.enabled) return true;
    }
    return false;
  }

  private shouldRun(): boolean {
    return this.hasEnabledSubscriber() && isAppForeground();
  }

  private patchSnapshot(patch: Partial<RiderTrackingSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.notify();
  }

  private applyPayload(payload: MerchantRiderTrackingPayload) {
    const next = withClientApproach(payload);
    this.dataRef = next;
    this.patchSnapshot({ data: next, error: null });
    for (const s of this.subscribers.values()) {
      if (s.enabled) s.onLocationPatch?.(next);
    }
  }

  reload = async (silent = true) => {
    if (!this.shouldRun()) return;
    const { storeId, ordersFoodId, token } = this.config;
    if (!silent) this.patchSnapshot({ loading: true });
    try {
      perfAuditMark("rider_tracking.http_poll");
      const payload = await fetchMerchantRiderTracking(storeId, ordersFoodId, token);
      this.applyPayload(payload);
    } catch (e) {
      if (!silent) {
        this.patchSnapshot({
          error: e instanceof Error ? e.message : "Could not load rider location",
        });
      }
    } finally {
      if (!silent) this.patchSnapshot({ loading: false });
    }
  };

  private clearWsTimers() {
    if (this.heartbeatId) clearInterval(this.heartbeatId);
    if (this.staleId) clearInterval(this.staleId);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.heartbeatId = null;
    this.staleId = null;
    this.reconnectTimer = null;
  }

  private clearPollTimers() {
    if (this.pollId) clearInterval(this.pollId);
    if (this.approachId) clearInterval(this.approachId);
    this.pollId = null;
    this.approachId = null;
  }

  private markDisconnected() {
    this.wsConnectedRef = false;
    this.patchSnapshot({ wsConnected: false });
  }

  private scheduleReconnect() {
    if (this.wsClosed || !this.shouldRun()) return;
    this.clearWsTimers();
    this.markDisconnected();
    const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    perfAuditMark("rider_tracking.ws_reconnect_scheduled");
    this.reconnectTimer = setTimeout(() => {
      void this.connectWs();
    }, delay);
  }

  private applyWsLocation(msg: Record<string, unknown>) {
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

    const filtered = filterRiderGpsSample(this.ticketIds, {
      latitude: lat,
      longitude: lng,
      headingDegrees: heading,
      accuracyMeters: accuracy,
      speedMps: speed,
      updatedAt,
    });
    if (!filtered.accept) return;

    perfAuditMark("rider_tracking.ws_location");

    const prev = this.dataRef;
    if (!prev) {
      void this.reload(true);
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
    this.applyPayload(next);
  }

  private async connectWs() {
    if (this.wsClosed || !this.shouldRun() || this.ticketIds.length === 0) return;
    const { token } = this.config;
    const { wsEnabled, wsBaseUrl, apiBaseUrl } = getConfig();
    if (!wsEnabled) return;

    try {
      const ticketRes = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/v1/auth/ws-ticket`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ orderIds: this.ticketIds }),
      });
      if (!ticketRes.ok) {
        this.scheduleReconnect();
        return;
      }
      const ticketJson = (await ticketRes.json()) as { ticket?: string };
      const ticket = ticketJson.ticket?.trim();
      if (!ticket) {
        this.scheduleReconnect();
        return;
      }

      const url = `${wsBaseUrl.replace(/\/+$/, "")}/v1/ws?ticket=${encodeURIComponent(ticket)}`;
      this.ws?.close();
      this.ws = new WebSocket(url);
      perfAuditMark("rider_tracking.ws_connect");

      this.ws.onopen = () => {
        if (this.wsClosed) return;
        this.reconnectAttempt = 0;
        this.lastMessageAt = Date.now();
        this.wsConnectedRef = true;
        this.patchSnapshot({ wsConnected: true });
        this.heartbeatId = setInterval(() => {
          try {
            this.ws?.send(JSON.stringify({ type: "ping" }));
            perfAuditMark("rider_tracking.ws_ping");
          } catch {
            /* ignore */
          }
        }, HEARTBEAT_INTERVAL_MS);
        this.staleId = setInterval(() => {
          if (Date.now() - this.lastMessageAt > STALE_CONNECTION_MS) {
            try {
              this.ws?.close();
            } catch {
              /* ignore */
            }
          }
        }, 15_000);
      };

      this.ws.onmessage = (ev) => {
        this.lastMessageAt = Date.now();
        try {
          const msg = JSON.parse(String(ev.data)) as Record<string, unknown>;
          if (msg.type === "pong" || msg.type === "ping") return;
          if (msg.type === "rider.location.updated.v1") {
            this.applyWsLocation(msg);
          }
          if (msg.type === "eta.updated.v1" || msg.type === "eta.updated") {
            for (const s of this.subscribers.values()) {
              if (s.enabled) s.onEtaUpdated?.(msg);
            }
            const stageAware = msg.stageAware as
              | { displayEta?: number | null; riderToMerchantEta?: number | null }
              | undefined;
            const display =
              stageAware?.riderToMerchantEta ?? stageAware?.displayEta ?? null;
            if (display != null && Number.isFinite(Number(display)) && this.dataRef) {
              const cur = this.dataRef;
              this.applyPayload({
                ...cur,
                approach: {
                  remaining_distance_m: cur.approach?.remaining_distance_m ?? 0,
                  eta_minutes: Math.max(1, Math.round(Number(display))),
                  source: "server_eta",
                },
              });
            }
          }
        } catch {
          /* ignore */
        }
      };

      this.ws.onerror = () => this.scheduleReconnect();
      this.ws.onclose = () => this.scheduleReconnect();
    } catch {
      this.scheduleReconnect();
    }
  }

  private startPollTimers() {
    if (this.pollId || this.approachId) return;
    this.pollId = setInterval(() => {
      if (!this.shouldRun() || this.wsConnectedRef) return;
      void this.reload(true);
    }, MERCHANT_RIDER_TRACKING_POLL_MS);
    this.approachId = setInterval(() => {
      if (!this.shouldRun() || !this.wsConnectedRef) return;
      void this.reload(true);
    }, APPROACH_REFRESH_MS);
  }

  private stopAll() {
    this.clearPollTimers();
    this.clearWsTimers();
    this.markDisconnected();
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.running = false;
  }

  private syncRuntime() {
    if (!this.shouldRun()) {
      if (this.running) this.stopAll();
      return;
    }
    if (!this.running) {
      this.running = true;
      this.wsClosed = false;
      void this.reload(false);
      this.startPollTimers();
      void this.connectWs();
      if (!this.foregroundUnsub) {
        this.foregroundUnsub = subscribeAppForeground((active) => {
          if (active) {
            this.reconnectAttempt = 0;
            void this.reload(true);
            this.syncRuntime();
          } else {
            this.wsClosed = true;
            this.stopAll();
          }
        });
      }
      return;
    }
    if (!this.pollId) this.startPollTimers();
  }

  dispose() {
    this.wsClosed = true;
    this.stopAll();
    this.foregroundUnsub?.();
    this.foregroundUnsub = null;
    this.subscribers.clear();
    this.snapshot = { ...EMPTY_SNAPSHOT };
    this.dataRef = null;
  }
}

let nextSubId = 1;
const sessions = new Map<SessionKey, RiderTrackingSession>();
const sessionListeners = new Map<SessionKey, Set<() => void>>();

function listenersFor(key: SessionKey): Set<() => void> {
  let set = sessionListeners.get(key);
  if (!set) {
    set = new Set();
    sessionListeners.set(key, set);
  }
  return set;
}

function notifyKey(key: SessionKey) {
  for (const fn of listenersFor(key)) fn();
}

export function getRiderTrackingSnapshot(key: SessionKey | null): RiderTrackingSnapshot {
  if (!key) return EMPTY_SNAPSHOT;
  return sessions.get(key)?.getSnapshot() ?? EMPTY_SNAPSHOT;
}

export function subscribeRiderTrackingSnapshot(key: SessionKey, onChange: () => void): () => void {
  const set = listenersFor(key);
  set.add(onChange);
  return () => set.delete(onChange);
}

export function acquireRiderTrackingSession(
  config: SessionConfig,
  handle: Omit<SubscriberHandle, "id">
): { key: SessionKey; id: number; reload: (silent?: boolean) => Promise<void> } {
  const key = sessionKey(config);
  let session = sessions.get(key);
  if (!session) {
    session = new RiderTrackingSession(key, config);
    session.setNotifier(() => notifyKey(key));
    sessions.set(key, session);
    perfAuditMark("rider_tracking.session_created");
  }
  const id = nextSubId++;
  session.addSubscriber({ ...handle, id });
  return {
    key,
    id,
    reload: (silent) => session!.reload(silent),
  };
}

export function updateRiderTrackingSubscriber(
  key: SessionKey,
  handle: SubscriberHandle
): void {
  sessions.get(key)?.updateSubscriber(handle);
}

export function releaseRiderTrackingSubscriber(key: SessionKey, id: number): void {
  const session = sessions.get(key);
  if (!session) return;
  session.removeSubscriber(id);
  if (session.hasEnabledSubscriber()) return;
  session.dispose();
  sessions.delete(key);
  sessionListeners.delete(key);
  perfAuditMark("rider_tracking.session_disposed");
}

export function buildRiderTrackingKey(
  storeId: number | null,
  ordersFoodId: number | null
): SessionKey | null {
  if (storeId == null || ordersFoodId == null) return null;
  return `${storeId}:${ordersFoodId}`;
}
