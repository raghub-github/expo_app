/**
 * Merchant app config — backend API URL from env.
 * Uses same backend as rest of monorepo (backend/.env API_BASE_URL).
 * Set EXPO_PUBLIC_API_BASE_URL in apps/merchant_app/.env (e.g. http://localhost:3000).
 */

import Constants from "expo-constants";
import { Platform } from "react-native";

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

/** Android emulator: localhost -> 10.0.2.2; legacy :30000/:4000 -> :3000. */
function resolveApiBaseUrl(raw: string): string {
  let trimmed = raw.replace(/\/+$/, "");
  try {
    const parsed = new URL(trimmed);
    if (parsed.port === "30000" || parsed.port === "4000") {
      parsed.port = "3000";
      trimmed = parsed.toString().replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  if (
    Platform.OS === "android" &&
    (/^https?:\/\/localhost(\b|:)/.test(trimmed) || /^https?:\/\/127\.0\.0\.1(\b|:)/.test(trimmed))
  ) {
    return trimmed.replace(/localhost|127\.0\.0\.1/, "10.0.2.2");
  }
  return trimmed;
}

/** Normalize any URL for the current device (e.g. localhost -> 10.0.2.2 on Android). Use for image URIs. */
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

function parseStoreId(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** Base URL for shareable store links (web + universal link). Opens store in app when installed, else in browser. */
const DEFAULT_STORE_WEB_BASE = "https://www.gatimitra.com";

export function getConfig(): {
  apiBaseUrl: string;
  storeId: number | null;
  googleWebClientId: string | null;
  /** Base URL for shareable store deep links (no trailing slash). */
  storeWebBaseUrl: string;
  /** Mapbox public token for map and geocoding (Edit Address). */
  mapboxPublicToken: string | null;
  /** Same Supabase project as Auth → Phone / Send SMS hook (optional if using backend-only phone OTP). */
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /**
   * When true, phone OTP uses `POST /v1/auth/otp/request` (backend + MSG91) like the customer app without Supabase.
   * Use when SMS does not arrive via Supabase (hook / MSG91 on API server).
   */
  phoneOtpUseBackendOnly: boolean;
} {
  // Production safety net: if EAS didn't bake EXPO_PUBLIC_API_BASE_URL into
  // the bundle, fall back to the public domain. localhost is unreachable from
  // a real phone, so a missing prod env was a guaranteed crash before.
  const PROD_FALLBACK = "https://api.gatimitra.com";
  const DEV_FALLBACK = "http://localhost:3000";
  const fallback = __DEV__ ? DEV_FALLBACK : PROD_FALLBACK;

  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  const fromExtra =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.API_BASE_URL ??
    (Constants.manifest2?.extra as Record<string, unknown> | undefined)?.API_BASE_URL ??
    fallback;
  const raw = (
    asNonEmptyString(fromEnv) ??
    asNonEmptyString(fromExtra) ??
    fallback
  ).trim();
  const storeIdEnv =
    process.env.EXPO_PUBLIC_STORE_ID ??
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.STORE_ID ??
    (Constants.manifest2?.extra as Record<string, unknown> | undefined)?.STORE_ID ??
    null; // Fallback if manifest2 is undefined
  const googleWebClientId =
    asNonEmptyString(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.GOOGLE_WEB_CLIENT_ID) ??
    null;
  const storeWebBase =
    asNonEmptyString(process.env.EXPO_PUBLIC_STORE_WEB_BASE_URL) ??
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.STORE_WEB_BASE_URL as string | undefined;
  const storeWebBaseUrl = asNonEmptyString(storeWebBase) ?? DEFAULT_STORE_WEB_BASE;
  const mapboxToken =
    asNonEmptyString(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN) ??
    asNonEmptyString(process.env.MAPBOX_PUBLIC_TOKEN) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.MAPBOX_PUBLIC_TOKEN) ??
    null;

  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const supabaseUrl =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
    asNonEmptyString(extra?.EXPO_PUBLIC_SUPABASE_URL as string) ??
    null;
  const supabaseAnonKey =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
    asNonEmptyString(extra?.EXPO_PUBLIC_SUPABASE_ANON_KEY as string) ??
    null;

  const phoneOtpBackendRaw =
    asNonEmptyString(process.env.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND) ??
    asNonEmptyString(extra?.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND as string);
  const phoneOtpUseBackendOnly =
    phoneOtpBackendRaw === "1" ||
    phoneOtpBackendRaw?.toLowerCase() === "true" ||
    phoneOtpBackendRaw?.toLowerCase() === "yes" ||
    phoneOtpBackendRaw?.toLowerCase() === "on";

  return {
    apiBaseUrl: resolveApiBaseUrl(raw),
    storeId: parseStoreId(storeIdEnv),
    googleWebClientId,
    storeWebBaseUrl: storeWebBaseUrl.replace(/\/+$/, ""),
    mapboxPublicToken: mapboxToken,
    supabaseUrl,
    supabaseAnonKey,
    phoneOtpUseBackendOnly,
  };
}
