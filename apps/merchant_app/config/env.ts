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
} {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  const fromExtra =
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.API_BASE_URL ??
    (Constants.manifest2?.extra as Record<string, unknown> | undefined)?.API_BASE_URL;
  const raw =
    asNonEmptyString(fromEnv) ??
    asNonEmptyString(fromExtra) ??
    "http://localhost:3000";
  const storeIdEnv = process.env.EXPO_PUBLIC_STORE_ID ??
    (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.STORE_ID ??
    (Constants.manifest2?.extra as Record<string, unknown> | undefined)?.STORE_ID;
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
  return {
    apiBaseUrl: resolveApiBaseUrl(raw),
    storeId: parseStoreId(storeIdEnv),
    googleWebClientId,
    storeWebBaseUrl: storeWebBaseUrl.replace(/\/+$/, ""),
    mapboxPublicToken: mapboxToken,
  };
}
