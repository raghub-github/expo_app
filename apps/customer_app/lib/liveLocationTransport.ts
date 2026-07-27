/**
 * Live location transport health for the customer app.
 * Used for silent WS/HTTP fallback decisions and rare user-facing outage UI.
 */

import { useEffect, useState } from "react";

export type LiveLocationTransportMode = "ws" | "http" | "none";

export type LiveLocationHealth = {
  /** WebSocket currently open and authenticated. */
  wsConnected: boolean;
  /** Actively trying to restore WS after a drop / resume. */
  reconnecting: boolean;
  /** Last accepted rider GPS wall-clock time (ms). */
  lastUpdateAtMs: number | null;
  /** Which pipe last delivered a location. */
  transport: LiveLocationTransportMode;
};

type Listener = (health: LiveLocationHealth) => void;

/** Internal stale threshold (HTTP fallback / diagnostics). Not shown in production UI. */
const STALE_AFTER_MS = 12_000;
/**
 * Only surface a user-facing message after a genuine outage.
 * Reconnecting / "last updated Xs ago" must never appear in production UI.
 */
const OUTAGE_AFTER_MS = 45_000;

let health: LiveLocationHealth = {
  wsConnected: false,
  reconnecting: false,
  lastUpdateAtMs: null,
  transport: "none",
};

const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => {
    try {
      listener(health);
    } catch {
      /* ignore */
    }
  });
}

function liveTrackDebugUiEnabled(): boolean {
  try {
    if (typeof __DEV__ === "undefined" || !__DEV__) return false;
    return String(process.env.EXPO_PUBLIC_LIVE_TRACK_DEBUG ?? "") === "1";
  } catch {
    return false;
  }
}

export function getLiveLocationHealth(): LiveLocationHealth {
  return health;
}

export function setLiveLocationWsConnected(next: boolean): void {
  const nextHealth: LiveLocationHealth = {
    ...health,
    wsConnected: next,
    reconnecting: next ? false : health.reconnecting,
    transport: next ? "ws" : health.transport === "ws" ? "http" : health.transport,
  };
  if (
    nextHealth.wsConnected === health.wsConnected &&
    nextHealth.reconnecting === health.reconnecting &&
    nextHealth.transport === health.transport
  ) {
    return;
  }
  health = nextHealth;
  emit();
}

export function setLiveLocationReconnecting(next: boolean): void {
  if (health.reconnecting === next) return;
  health = { ...health, reconnecting: next };
  emit();
}

export function noteLiveLocationUpdate(transport: Exclude<LiveLocationTransportMode, "none">): void {
  health = {
    ...health,
    lastUpdateAtMs: Date.now(),
    transport,
    reconnecting: transport === "ws" ? false : health.reconnecting,
  };
  emit();
}

export function resetLiveLocationHealth(): void {
  health = {
    wsConnected: false,
    reconnecting: false,
    lastUpdateAtMs: null,
    transport: "none",
  };
  emit();
}

export function getLiveLocationWsConnected(): boolean {
  return health.wsConnected;
}

export function useLiveLocationWsConnected(): boolean {
  const [connected, setConnected] = useState(health.wsConnected);
  useEffect(() => {
    const onChange = (next: LiveLocationHealth) => setConnected(next.wsConnected);
    listeners.add(onChange);
    setConnected(health.wsConnected);
    return () => {
      listeners.delete(onChange);
    };
  }, []);
  return connected;
}

export function useLiveLocationHealth(): LiveLocationHealth {
  const [state, setState] = useState(health);
  useEffect(() => {
    listeners.add(setState);
    setState(health);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

export type LiveTrackingStatusKind = "outage" | "debug_reconnecting" | "debug_paused";

export type LiveTrackingStatusView = {
  kind: LiveTrackingStatusKind;
  label: string;
  /** Seconds since last GPS; null if never. */
  ageSeconds: number | null;
};

/**
 * Production: only a long-outage message (or nothing).
 * Dev + EXPO_PUBLIC_LIVE_TRACK_DEBUG=1: reconnecting / paused chips for engineers.
 */
export function resolveLiveTrackingStatus(
  h: LiveLocationHealth,
  nowMs: number = Date.now()
): LiveTrackingStatusView | null {
  const ageSeconds =
    h.lastUpdateAtMs != null ? Math.max(0, Math.round((nowMs - h.lastUpdateAtMs) / 1000)) : null;
  const ageMs = h.lastUpdateAtMs != null ? nowMs - h.lastUpdateAtMs : null;

  if (liveTrackDebugUiEnabled()) {
    const stale = ageMs != null && ageMs >= STALE_AFTER_MS;
    if (h.reconnecting || (!h.wsConnected && h.transport !== "none" && h.lastUpdateAtMs != null)) {
      return {
        kind: "debug_reconnecting",
        label:
          ageSeconds != null
            ? `Reconnecting… · Last updated: ${ageSeconds}s ago`
            : "Reconnecting…",
        ageSeconds,
      };
    }
    if (stale) {
      return {
        kind: "debug_paused",
        label:
          ageSeconds != null
            ? `Live tracking paused · Last updated: ${ageSeconds}s ago`
            : "Live tracking paused",
        ageSeconds,
      };
    }
    return null;
  }

  // No first fix yet — keep UI silent while transport recovers in the background.
  if (h.lastUpdateAtMs == null || ageMs == null) return null;

  if (ageMs >= OUTAGE_AFTER_MS) {
    return {
      kind: "outage",
      label: "Unable to update live location. Please check your internet connection.",
      ageSeconds,
    };
  }

  return null;
}

export { STALE_AFTER_MS, OUTAGE_AFTER_MS };

declare const __DEV__: boolean | undefined;
