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
   * When true, phone OTP uses `POST /v1/auth/otp/request` (backend + MSG91).
   * Default (same as merchant): Supabase signInWithOtp → Send SMS hook → MSG91.
   */
  phoneOtpUseBackendOnly: boolean;
  mapboxToken?: string;
};

/** Same public project as merchant_app / eas.json — Send SMS hook lives here. */
const CANONICAL_SUPABASE_URL = "https://uoxkwznciiibubtiiffh.supabase.co";
const CANONICAL_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVveGt3em5jaWlpYnVidGlpZmZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1NDM2OTQsImV4cCI6MjA4MzExOTY5NH0.r61tUqHUEDp4ia9tyY8IJHB-6acRcbVsZo3s8T3v8_Q";

/** Retired / unresolvable projects that break OTP with "Network request failed". */
const DEAD_SUPABASE_HOSTS = new Set(["mjfnzmepmeqemcoakjkw.supabase.co"]);
const loggedDeadSupabaseHosts = new Set<string>();

function resolveSupabaseProject(
  url: string | null,
  anonKey: string | null
): { supabaseUrl: string | null; supabaseAnonKey: string | null } {
  if (!url || !anonKey) {
    return { supabaseUrl: url, supabaseAnonKey: anonKey };
  }
  let host = "";
  try {
    host = new URL(url).host.toLowerCase();
  } catch {
    return {
      supabaseUrl: CANONICAL_SUPABASE_URL,
      supabaseAnonKey: CANONICAL_SUPABASE_ANON_KEY,
    };
  }
  if (DEAD_SUPABASE_HOSTS.has(host)) {
    if (__DEV__ && !loggedDeadSupabaseHosts.has(host)) {
      loggedDeadSupabaseHosts.add(host);
      // eslint-disable-next-line no-console
      console.warn(
        `[RiderEnv] Ignoring dead Supabase host ${host}; using merchant project ${CANONICAL_SUPABASE_URL}`
      );
    }
    return {
      supabaseUrl: CANONICAL_SUPABASE_URL,
      supabaseAnonKey: CANONICAL_SUPABASE_ANON_KEY,
    };
  }
  return { supabaseUrl: url, supabaseAnonKey: anonKey };
}

function isLocalhostApiUrl(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(\b|:)/.test(url.replace(/\/+$/, ""));
}

function isPlausibleIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) >= 0 && Number(p) <= 255);
}

function normalizeDevHost(raw: string): string | null {
  const host = raw.replace(/^https?:\/\//, "").split("/")[0].replace(/:\d+$/, "").trim();
  return host && isPlausibleIpv4(host) ? host : null;
}

function isPrivateLanIpv4(host: string): boolean {
  if (!isPlausibleIpv4(host)) return false;
  // Android emulator / Genymotion host aliases — not a Wi‑Fi LAN address.
  if (host === "10.0.2.2" || host === "10.0.3.2") return false;
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

function portFromApiUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.port) return parsed.port;
  } catch {
    /* ignore */
  }
  return apiDevPort();
}

/** Metro / Expo dev server LAN IP (e.g. 10.49.x.x from hostUri) — avoids localhost on a physical phone. */
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

function preferredDevLanHost(): string | null {
  const fromBundler = inferLanHostFromExpoBundler();
  if (fromBundler && isPrivateLanIpv4(fromBundler)) return fromBundler;
  const fromDevHost = normalizeDevHost(process.env.EXPO_PUBLIC_DEV_HOST ?? "");
  if (fromDevHost && isPrivateLanIpv4(fromDevHost)) return fromDevHost;
  const fromApi = hostFromApiUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
  if (fromApi && isPrivateLanIpv4(fromApi)) return fromApi;
  return null;
}

const loggedLanHeals = new Set<string>();
let loggedResolvedApiUrl: string | null = null;

/** Backend HTTP port — must match `PORT` in backend/.env (default 3000). */
function apiDevPort(): string {
  const raw = asNonEmptyString(process.env.EXPO_PUBLIC_API_PORT) ?? "3000";
  return raw === "30000" || raw === "4000" ? "3000" : raw;
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

/**
 * Wi‑Fi IPs change often. In __DEV__, if a configured URL points at a different
 * private LAN IP than this PC's current Metro host, rewrite to the live IP.
 */
function healStaleLanApiUrl(url: string): string {
  if (!__DEV__) return url;
  const lan = preferredDevLanHost();
  if (!lan) return url;
  const host = hostFromApiUrl(url);
  if (!host || host === lan || !isPrivateLanIpv4(host)) return url;
  const healed = `http://${lan}:${portFromApiUrl(url)}`;
  const healKey = `${url}→${healed}`;
  if (!loggedLanHeals.has(healKey)) {
    loggedLanHeals.add(healKey);
    // eslint-disable-next-line no-console
    console.log(
      `[RiderEnv] healed stale LAN API URL ${url} → ${healed} (set EXPO_PUBLIC_API_BASE_URL=${healed} to silence)`
    );
  }
  return healed;
}

/**
 * Android emulator: localhost / 127.0.0.1 → 10.0.2.2 (host loopback).
 * Physical device + localhost: Metro LAN IP when available.
 * Explicit LAN / public URLs from env are left alone — Expo Go on real phones
 * often reports Constants.isDevice=false, so we must never smash a working
 * Wi‑Fi IP into the emulator-only 10.0.2.2 alias.
 * Legacy :30000/:4000 → :3000.
 */
function resolveApiBaseUrl(raw: string): string {
  const trimmed = normalizeLegacyBackendPort(raw.replace(/\/+$/, ""));
  const port = portFromApiUrl(trimmed);

  if (isLocalhostApiUrl(trimmed)) {
    if (Constants.isDevice) {
      const lan = inferLanHostFromExpoBundler() ?? preferredDevLanHost();
      if (lan) return `http://${lan}:${port}`;
    }
    if (Platform.OS === "android") {
      return `http://10.0.2.2:${port}`;
    }
    return trimmed;
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
  const rawSupabaseUrl =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
    asNonEmptyString(extra.EXPO_PUBLIC_SUPABASE_URL);
  const rawSupabaseAnonKey =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
    asNonEmptyString(extra.EXPO_PUBLIC_SUPABASE_ANON_KEY);
  const { supabaseUrl, supabaseAnonKey } = resolveSupabaseProject(
    rawSupabaseUrl,
    rawSupabaseAnonKey
  );
  const phoneOtpBackendRaw =
    asNonEmptyString(process.env.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND) ??
    asNonEmptyString(extra.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND);
  const phoneOtpUseBackendOnly =
    phoneOtpBackendRaw === "1" ||
    phoneOtpBackendRaw?.toLowerCase() === "true" ||
    phoneOtpBackendRaw?.toLowerCase() === "yes" ||
    phoneOtpBackendRaw?.toLowerCase() === "on";
  const fromExtra = asNonEmptyString(extra.API_BASE_URL);
  const devHost = normalizeDevHost(process.env.EXPO_PUBLIC_DEV_HOST ?? "");
  const port = apiDevPort();

  // Production safety net — see merchant_app/config/env.ts for rationale.
  const fallback = __DEV__ ? `http://localhost:${port}` : "https://api.gatimitra.com";

  let rawUrl: string;
  // Explicit LAN URL in .env.local wins over DEV_HOST (avoids stale/wrong DEV_HOST in .env).
  if (fromEnv && !isLocalhostApiUrl(fromEnv)) {
    rawUrl = fromEnv.replace(/\/+$/, "");
  } else if (devHost) {
    rawUrl = `http://${devHost}:${port}`;
  } else {
    rawUrl = (asNonEmptyString(fromEnv) ?? asNonEmptyString(fromExtra) ?? fallback).replace(
      /\/+$/,
      ""
    );
  }

  const apiBaseUrl = healStaleLanApiUrl(resolveApiBaseUrl(rawUrl));

  if (__DEV__ && loggedResolvedApiUrl !== apiBaseUrl) {
    loggedResolvedApiUrl = apiBaseUrl;
    const host = hostFromApiUrl(apiBaseUrl);
    const emulatorHint =
      Platform.OS === "android" && (host === "10.0.2.2" || host === "10.0.3.2")
        ? " (Android emulator host loopback)"
        : "";
    // eslint-disable-next-line no-console
    console.log(`[RiderEnv] API base URL: ${apiBaseUrl}${emulatorHint}`);
  }

  const mapboxToken = resolveMapboxPublicToken();
  const wsBaseUrl = resolveWsBaseUrl(apiBaseUrl);
  const wsEnabled = isRiderWsEnabled();

  return {
    apiBaseUrl,
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

/**
 * Normalize API / asset URLs for the current device.
 * Only rewrite loopback (localhost / 127.0.0.1). Never rewrite an explicit LAN
 * IP to 10.0.2.2 — that breaks physical phones when Expo mis-reports isDevice.
 */
export function resolveUrlForDevice(url: string): string {
  if (typeof url !== "string" || !url.trim()) return url;
  const trimmed = url.trim().replace(/\/+$/, "");
  const healed = healStaleLanApiUrl(trimmed);

  if (isLocalhostApiUrl(healed)) {
    if (Constants.isDevice) {
      const lan = inferLanHostFromExpoBundler() ?? preferredDevLanHost();
      if (lan) return `http://${lan}:${portFromApiUrl(healed)}`;
    }
    if (Platform.OS === "android") {
      return healed.replace(/localhost|127\.0\.0\.1/g, "10.0.2.2");
    }
  }
  return healed;
}

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}


