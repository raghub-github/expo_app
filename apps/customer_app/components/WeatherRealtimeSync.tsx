import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { getConfig } from "@/config/env";
import { useAuthStore } from "@/store/authStore";
import { useLocationStore } from "@/store/locationStore";
import { resolveHomeWeatherQueryParams } from "@/lib/weather-location";
import { buildWeatherZoneKey } from "@/lib/weatherZoneKey";
import {
  patchLocationWeatherCache,
} from "@/hooks/useLocationWeather";
import type { CustomerWeatherContext } from "@/services/weather.service";
import { shouldSuspendRealtimeTransport } from "@/lib/realtime-lifecycle";
import { thermalAudit } from "@/lib/thermalAudit";

const RECONNECT_BASE_MS = 3_000;
const RECONNECT_MAX_MS = 60_000;
const HEARTBEAT_INTERVAL_MS = 20_000;
const STALE_CONNECTION_MS = 75_000;

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

type WeatherChangedEvent = {
  type: "weather_changed";
  event?: string;
  zoneKey?: string;
  weather?: CustomerWeatherContext;
};

/**
 * Subscribes to `zone:{gridKey}` for rain push updates.
 * REST bootstrap remains the first load; WebSocket only pushes rain-related changes.
 */
export function WeatherRealtimeSync() {
  const queryClient = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const locationHydrated = useLocationStore((s) => s.locationHydrated);
  const coords = useLocationStore((s) => s.coords);
  const address = useLocationStore((s) => s.address);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const failureCountRef = useRef(0);
  const lastActivityRef = useRef(Date.now());
  const cancelledRef = useRef(false);
  const connectGenRef = useRef(0);
  const connectInFlightRef = useRef(false);
  const suspendedRef = useRef(false);

  useEffect(() => {
    const { wsEnabled } = getConfig();
    if (!wsEnabled || !authHydrated || !locationHydrated || !session?.accessToken || !coords) {
      cancelledRef.current = true;
      connectGenRef.current += 1;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
      failureCountRef.current = 0;
      return;
    }

    const weatherParams = resolveHomeWeatherQueryParams(address, coords);
    const zoneKey =
      weatherParams.lat != null && weatherParams.lng != null
        ? buildWeatherZoneKey(weatherParams.lat, weatherParams.lng)
        : null;
    if (!zoneKey) return;

    cancelledRef.current = false;
    const accessToken = session.accessToken;
    const { apiBaseUrl, wsBaseUrl } = getConfig();

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
        if (cancelledRef.current || ws.readyState !== WebSocket.OPEN) return;
        const idleMs = Date.now() - lastActivityRef.current;
        if (idleMs >= STALE_CONNECTION_MS) {
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
          /* ignore */
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    const scheduleReconnect = (reason: string) => {
      if (cancelledRef.current || suspendedRef.current) return;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** failureCountRef.current, RECONNECT_MAX_MS);
      reconnectTimer.current = setTimeout(() => void connect(`backoff:${reason}`), delay);
    };

    const connect = async (reason: string) => {
      if (cancelledRef.current || connectInFlightRef.current || suspendedRef.current) return;
      connectInFlightRef.current = true;
      const gen = ++connectGenRef.current;

      try {
        const gatewayUp = await isWsGatewayReachable(wsBaseUrl);
        if (!gatewayUp) {
          failureCountRef.current += 1;
          scheduleReconnect("gateway_down");
          return;
        }

        const ticketRes = await fetch(`${apiBaseUrl}/v1/auth/ws-ticket`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ zoneKeys: [zoneKey] }),
        });

        if (!ticketRes.ok || cancelledRef.current || gen !== connectGenRef.current) {
          failureCountRef.current += 1;
          scheduleReconnect("ticket_failed");
          return;
        }

        const ticketJson = (await ticketRes.json()) as {
          ticket?: string;
          zoneWeather?: Record<string, CustomerWeatherContext>;
        };
        if (!ticketJson.ticket || cancelledRef.current || gen !== connectGenRef.current) {
          failureCountRef.current += 1;
          scheduleReconnect("ticket_missing");
          return;
        }

        const cachedFromTicket = ticketJson.zoneWeather?.[zoneKey];
        if (cachedFromTicket?.rainDetected && cachedFromTicket?.showBanner) {
          patchLocationWeatherCache(queryClient, weatherParams, cachedFromTicket);
        }

        const ws = new WebSocket(`${wsBaseUrl}/v1/ws?ticket=${encodeURIComponent(ticketJson.ticket)}`);
        wsRef.current = ws;

        ws.onopen = () => {
          if (cancelledRef.current || gen !== connectGenRef.current) {
            ws.close();
            return;
          }
          failureCountRef.current = 0;
          touchActivity();
          startHeartbeat(ws);
        };

        ws.onmessage = (event) => {
          touchActivity();
          try {
            const payload = JSON.parse(String(event.data)) as WeatherChangedEvent;
            if (payload.type !== "weather_changed" || !payload.weather) return;
            const w = payload.weather;
            const isRainPush =
              w.rainDetected ||
              w.showBanner ||
              payload.event === "rain_stopped" ||
              w.severity === "CLEAR";
            if (!isRainPush) return;
            patchLocationWeatherCache(queryClient, weatherParams, w);
          } catch {
            /* ignore malformed frames */
          }
        };

        ws.onclose = () => {
          clearHeartbeat();
          if (cancelledRef.current || gen !== connectGenRef.current || suspendedRef.current) return;
          failureCountRef.current += 1;
          scheduleReconnect("closed");
        };

        ws.onerror = () => {
          failureCountRef.current += 1;
        };
      } finally {
        connectInFlightRef.current = false;
      }
    };

    if (shouldSuspendRealtimeTransport(AppState.currentState)) {
      suspendedRef.current = true;
    } else {
      void connect("mount");
    }

    const appStateSub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (shouldSuspendRealtimeTransport(state)) {
        suspendedRef.current = true;
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
        clearHeartbeat();
        try {
          wsRef.current?.close();
        } catch {
          /* ignore */
        }
        thermalAudit("WS_SUSPEND", { reason: "weather_background" });
        return;
      }
      if (state === "active" && !cancelledRef.current) {
        suspendedRef.current = false;
        failureCountRef.current = 0;
        void connect("foreground");
      }
    });

    return () => {
      cancelledRef.current = true;
      connectGenRef.current += 1;
      appStateSub.remove();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      clearHeartbeat();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [
    authHydrated,
    locationHydrated,
    session?.accessToken,
    coords?.latitude,
    coords?.longitude,
    address?.city,
    address?.state,
    address?.fullAddress,
    address?.primary,
    address?.secondary,
    queryClient,
  ]);

  return null;
}
