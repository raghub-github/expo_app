import Constants from "expo-constants";
import { Platform } from "react-native";
import { resolveMapboxPublicToken } from "@/src/lib/mapbox-env";

type RiderAppConfig = {
  apiBaseUrl: string;
  /** WebSocket gateway (ws-gateway service). Separate from REST API in local dev. */
  wsBaseUrl: string;
  /** Live dispatch offers on duty (requires ws-gateway, not the REST API on :3000). */
  wsEnabled: boolean;
  /**
   * OTP provider is backend-owned. Rider app must not integrate OTP providers directly.
   * Kept as a flag for future debugging, but only "msg91" is supported.
   */
  otpProvider: "msg91";
  mapboxToken?: string;
};

/**
 * Expo public env rule:
 * - Only variables prefixed with `EXPO_PUBLIC_` are available in the app bundle.
 * - No secrets must ever be placed in Expo public env.
 */
export function getRiderAppConfig(): RiderAppConfig {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  // Force backend-driven OTP (MSG91 is called by backend, not by the app).
  // Ignore any EXPO_PUBLIC_OTP_PROVIDER to prevent accidental Firebase OTP wiring.
  const otpProvider: "msg91" = "msg91";

  // Allow overriding via app config extra if needed.
  const fromExtra =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.API_BASE_URL ??
    (Constants.manifest2?.extra as Record<string, unknown> | undefined)?.API_BASE_URL;

  // Production safety net — see merchant_app/config/env.ts for rationale.
  const fallback = __DEV__ ? "http://localhost:3000" : "https://api.gatimitra.com";
  const apiBaseUrl = (
    asNonEmptyString(fromEnv) ??
    asNonEmptyString(fromExtra) ??
    fallback
  ).replace(/\/+$/, "");

  const mapboxToken = resolveMapboxPublicToken();
  const wsBaseUrl = resolveWsBaseUrl(apiBaseUrl);
  const wsEnabled = isRiderWsEnabled();

  return { apiBaseUrl, wsBaseUrl, wsEnabled, otpProvider, mapboxToken };
}

/**
 * Realtime dispatch socket (ws-gateway). Optional in local dev — push + polling still work.
 * Set EXPO_PUBLIC_WS_ENABLED=false when only backend (:3000) is running.
 */
export function isRiderWsEnabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_WS_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  return true;
}

/**
 * REST API (backend :3000) and WebSocket gateway (ws-gateway :4100) are different services.
 * Without EXPO_PUBLIC_WS_BASE_URL the rider app was opening ws://host:3000/v1/ws → HTTP 404 spam.
 */
export function resolveWsBaseUrl(apiBaseUrl: string): string {
  const fromEnv = process.env.EXPO_PUBLIC_WS_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  try {
    const parsed = new URL(apiBaseUrl);
    const wsPort = process.env.EXPO_PUBLIC_WS_PORT?.trim() || "4100";
    if (parsed.port === "3000" || parsed.port === "4000" || parsed.port === "") {
      parsed.port = wsPort;
    }
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return parsed.origin;
  } catch {
    return apiBaseUrl.replace(/^http/i, "ws").replace(/\/+$/, "");
  }
}

/** Normalize localhost URLs for Android emulator (10.0.2.2). */
export function resolveUrlForDevice(url: string): string {
  if (typeof url !== "string" || !url.trim()) return url;
  const u = url.trim();
  if (
    Platform.OS === "android" &&
    (/https?:\/\/localhost(\b|:)/.test(u) || /https?:\/\/127\.0\.0\.1(\b|:)/.test(u))
  ) {
    return u.replace(/localhost|127\.0\.0\.1/g, "10.0.2.2");
  }
  return u;
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}


