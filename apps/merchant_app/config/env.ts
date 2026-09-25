/**
 * Merchant app config — backend API URL from env.
 * Uses same backend as rest of monorepo (backend/.env API_BASE_URL).
 * Set EXPO_PUBLIC_API_BASE_URL in apps/merchant_app/.env (e.g. http://localhost:3000).
 *
 * In __DEV__, stale private LAN IPs (Wi‑Fi DHCP changes) are rewritten to Metro's
 * current host so a physical phone keeps reaching this machine.
 */

import Constants from "expo-constants";
import { Platform } from "react-native";

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function isLocalhostApiUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(\b|:)/.test(url.replace(/\/+$/, ""));
}

function isPlausibleIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function isPrivateLanIpv4(host: string): boolean {
  if (!isPlausibleIpv4(host)) return false;
  const [a, b] = host.split(".").map(Number);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

function hostFromApiUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function apiDevPort(): string {
  const raw = asNonEmptyString(process.env.EXPO_PUBLIC_API_PORT) ?? "3000";
  return raw === "30000" || raw === "4000" ? "3000" : raw;
}

/** Metro / Expo Go LAN IP — physical phones cannot reach localhost or 10.0.2.2. */
export function inferLanHostFromExpoBundler(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants.expoGoConfig as { hostUri?: string } | undefined)?.hostUri;
  if (typeof hostUri === "string" && hostUri.length > 0) {
    const host = hostUri.split(":")[0]?.trim();
    if (host && host !== "localhost" && host !== "127.0.0.1") return host;
  }
  const debuggerHost = (Constants.manifest as { debuggerHost?: string } | null)?.debuggerHost;
  if (typeof debuggerHost === "string" && debuggerHost.length > 0) {
    const host = debuggerHost.split(":")[0]?.trim();
    if (host && host !== "localhost" && host !== "127.0.0.1") return host;
  }
  return null;
}

/** Rewrite stale private LAN IPs to Metro's current host (Wi‑Fi DHCP churn). Silent. */
function healStaleLanApiUrl(url: string): string {
  if (!__DEV__) return url;
  const lan = inferLanHostFromExpoBundler();
  if (!lan || !isPrivateLanIpv4(lan)) return url;
  const host = hostFromApiUrl(url);
  if (!host || host === lan || !isPrivateLanIpv4(host)) return url;
  let port = apiDevPort();
  try {
    const parsed = new URL(url);
    if (parsed.port) port = parsed.port;
  } catch {
    /* keep apiDevPort() */
  }
  return `http://${lan}:${port}`;
}

function normalizeLegacyBackendPort(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.port === "30000" || parsed.port === "4000") {
      parsed.port = "3000";
      return parsed.toString().replace(/\/$/, "");
    }
  } catch {
    /* ignore */
  }
  return url;
}

/** Android emulator: localhost → 10.0.2.2; physical device: Metro LAN host. */
function resolveApiBaseUrl(raw: string): string {
  const trimmed = normalizeLegacyBackendPort(raw.replace(/\/+$/, ""));
  if (!isLocalhostApiUrl(trimmed)) return healStaleLanApiUrl(trimmed);

  const portMatch = trimmed.match(/:(\d+)(?:\/|$)/);
  const port = portMatch?.[1] ?? apiDevPort();

  if (Platform.OS === "android") {
    if (Constants.isDevice) {
      const lan = inferLanHostFromExpoBundler();
      if (lan) return `http://${lan}:${port}`;
    }
    return trimmed.replace(/localhost|127\.0\.0\.1/, "10.0.2.2");
  }

  if (Constants.isDevice) {
    const lan = inferLanHostFromExpoBundler();
    if (lan) return `http://${lan}:${port}`;
  }

  return trimmed;
}

/** Normalize any URL for the current device (images, partner links). */
export function resolveUrlForDevice(url: string): string {
  if (typeof url !== "string" || !url.trim()) return url;
  const u = url.trim();
  if (!/https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(\b|:)/.test(u)) {
    return healStaleLanApiUrl(u);
  }
  const portMatch = u.match(/:(\d+)(?:\/|$)/);
  const port = portMatch?.[1] ?? apiDevPort();
  if (Constants.isDevice) {
    const lan = inferLanHostFromExpoBundler();
    if (lan) {
      return u.replace(/https?:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?/g, `http://${lan}:${port}`);
    }
  }
  if (Platform.OS === "android") {
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

/** Partner portal (legal pages, signup webview). Production: partner.gatimitra.com; local dev: partnersite on :3002. */
const DEFAULT_PARTNER_SITE_BASE = "https://partner.gatimitra.com";
const DEV_PARTNER_SITE_FALLBACK = "http://localhost:3002";

export function getConfig(): {
  apiBaseUrl: string;
  storeId: number | null;
  googleWebClientId: string | null;
  /** Base URL for shareable store deep links (no trailing slash). */
  storeWebBaseUrl: string;
  /** Partner portal base URL for legal pages and web flows (no trailing slash). */
  partnerSiteBaseUrl: string;
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
  /** WebSocket gateway for live rider location (same as customer). */
  wsBaseUrl: string;
  wsEnabled: boolean;
} {
  // Production safety net: if EAS didn't bake EXPO_PUBLIC_API_BASE_URL into
  // the bundle, fall back to the public domain. localhost is unreachable from
  // a real phone, so a missing prod env was a guaranteed crash before.
  const PROD_FALLBACK = "https://api.gatimitra.com";
  const DEV_FALLBACK = `http://localhost:${apiDevPort()}`;
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
  const apiBaseUrl = resolveApiBaseUrl(raw);
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
  const partnerSiteFromEnv =
    asNonEmptyString(process.env.EXPO_PUBLIC_PARTNER_SITE_URL) ??
    asNonEmptyString(
      (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.PARTNER_SITE_URL as string,
    );
  const partnerSiteBaseUrl = resolveUrlForDevice(
    asNonEmptyString(partnerSiteFromEnv) ??
      (__DEV__ ? DEV_PARTNER_SITE_FALLBACK : DEFAULT_PARTNER_SITE_BASE)
  );
  const mapboxToken =
    asNonEmptyString(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN) ??
    asNonEmptyString(process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN) ??
    asNonEmptyString(process.env.MAPBOX_PUBLIC_TOKEN) ??
    asNonEmptyString(process.env.NEXT_PUBLIC_MAPBOX_TOKEN) ??
    asNonEmptyString(
      (Constants.expoConfig?.extra as Record<string, unknown> | undefined)
        ?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string
    ) ??
    asNonEmptyString(
      (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.MAPBOX_PUBLIC_TOKEN as string
    ) ??
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
    apiBaseUrl,
    storeId: parseStoreId(storeIdEnv),
    googleWebClientId,
    storeWebBaseUrl: storeWebBaseUrl.replace(/\/+$/, ""),
    partnerSiteBaseUrl: partnerSiteBaseUrl.replace(/\/+$/, ""),
    mapboxPublicToken: mapboxToken,
    supabaseUrl,
    supabaseAnonKey,
    phoneOtpUseBackendOnly,
    wsBaseUrl: resolveWsBaseUrl(apiBaseUrl),
    wsEnabled: isMerchantWsEnabled(),
  };
}

export function isMerchantWsEnabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_WS_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  return true;
}

/** REST (:3000) and ws-gateway (:4100) are separate services in local dev. */
function healStaleLanWsUrl(url: string): string {
  if (!__DEV__) return url;
  try {
    const asHttp = url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
    const healed = healStaleLanApiUrl(asHttp);
    const parsed = new URL(healed);
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return parsed.origin;
  } catch {
    return url;
  }
}

export function resolveWsBaseUrl(apiBaseUrl: string): string {
  const fromEnv = process.env.EXPO_PUBLIC_WS_BASE_URL?.trim();
  if (fromEnv) return healStaleLanWsUrl(fromEnv.replace(/\/+$/, ""));

  try {
    const parsed = new URL(apiBaseUrl);
    const wsPort = process.env.EXPO_PUBLIC_WS_PORT?.trim() || "4100";
    if (parsed.port === "3000" || parsed.port === "4000" || parsed.port === "") {
      parsed.port = wsPort;
    }
    parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
    return healStaleLanWsUrl(parsed.origin);
  } catch {
    return __DEV__ ? "ws://localhost:4100" : "wss://ws.gatimitra.com";
  }
}
