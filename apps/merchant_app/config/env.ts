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

function parseStoreId(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

export function getConfig(): {
  apiBaseUrl: string;
  storeId: number | null;
  googleWebClientId: string | null;
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
  return {
    apiBaseUrl: resolveApiBaseUrl(raw),
    storeId: parseStoreId(storeIdEnv),
    googleWebClientId,
  };
}
