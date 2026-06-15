import Constants from "expo-constants";
import { Platform } from "react-native";
import { resolveMapboxPublicToken } from "@/src/lib/mapbox-env";

type RiderAppConfig = {
  apiBaseUrl: string;
  /** WebSocket gateway (ws-gateway service). Separate from REST API in local dev. */
  wsBaseUrl: string;
  /** Live dispatch offers on duty (requires ws-gateway, not the REST API on :3000). */
  wsEnabled: boolean;
  /** Same Supabase project as customer/merchant (Phone Auth + Send SMS hook → MSG91). */
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /**
   * When true, phone OTP uses POST /v1/auth/otp/request (backend + MSG91) — same as customer/merchant
   * with EXPO_PUBLIC_PHONE_OTP_USE_BACKEND=true (typical for LAN dev when Supabase hook is not public).
   */
  phoneOtpUseBackendOnly: boolean;
  mapboxToken?: string;
};

/** Android emulator: localhost -> 10.0.2.2 so backend on host is reachable. */
function resolveApiBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  if (
    Platform.OS === "android" &&
    (/^https?:\/\/localhost(\b|:)/.test(trimmed) || /^https?:\/\/127\.0\.0\.1(\b|:)/.test(trimmed))
  ) {
    return trimmed.replace(/localhost|127\.0\.0\.1/, "10.0.2.2");
  }
  return trimmed;
}

/**
 * Expo public env rule:
 * - Only variables prefixed with `EXPO_PUBLIC_` are available in the app bundle.
 * - No secrets must ever be placed in Expo public env.
 */
export function getRiderAppConfig(): RiderAppConfig {
  const extra =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined) ??
    (Constants.manifest2?.extra as Record<string, unknown> | undefined) ??
    {};

  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  const supabaseUrl =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
    asNonEmptyString(extra.EXPO_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
    asNonEmptyString(extra.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const phoneOtpBackendRaw =
    asNonEmptyString(process.env.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND) ??
    asNonEmptyString(extra.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND);
  const phoneOtpUseBackendOnly =
    phoneOtpBackendRaw === "1" ||
    phoneOtpBackendRaw?.toLowerCase() === "true" ||
    phoneOtpBackendRaw?.toLowerCase() === "yes" ||
    phoneOtpBackendRaw?.toLowerCase() === "on";
  const fromExtra = asNonEmptyString(extra.API_BASE_URL);

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

  return {
    apiBaseUrl: resolveApiBaseUrl(apiBaseUrl),
    wsBaseUrl,
    wsEnabled,
    supabaseUrl,
    supabaseAnonKey,
    phoneOtpUseBackendOnly,
    mapboxToken,
  };
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


