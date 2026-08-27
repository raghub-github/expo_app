import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * App config from env. EXPO_PUBLIC_* only in bundle.
 * On Android emulator, localhost is rewritten to 10.0.2.2 so the app can reach the host machine.
 *
 * Runtime override
 * ----------------
 * EXPO_PUBLIC_API_BASE_URL is compiled into the JS bundle at build time, which
 * means a fresh EAS build is needed every time the dev machine's LAN IP
 * changes. To avoid that, callers can set a runtime override (persisted in
 * AsyncStorage from the login screen's "Configure API URL" sheet). When set,
 * the override wins; otherwise we fall back to env.
 */

let runtimeApiBaseUrlOverride: string | null = null;

/** Set/clear the runtime override. Pass null to clear. No-op for empty strings. */
export function setRuntimeApiBaseUrl(url: string | null): void {
  if (url == null) {
    runtimeApiBaseUrlOverride = null;
    return;
  }
  const trimmed = url.trim().replace(/\/+$/, "");
  runtimeApiBaseUrlOverride = trimmed.length > 0 ? trimmed : null;
}

export function getRuntimeApiBaseUrl(): string | null {
  return runtimeApiBaseUrlOverride;
}

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

function normalizeDevHost(raw: string): string | null {
  const host = raw.replace(/^https?:\/\//, "").split("/")[0].replace(/:\d+$/, "").trim();
  return host && isPlausibleIpv4(host) ? host : null;
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

/** Metro / Expo dev server LAN IP (e.g. 192.168.x.x from hostUri) — avoids localhost on a physical phone. */
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

/**
 * Preferred LAN host for this PC in __DEV__: Metro hostUri first, then
 * EXPO_PUBLIC_DEV_HOST / API_BASE_URL from env (survives offline Metro).
 */
function preferredDevLanHost(): string | null {
  const fromBundler = inferLanHostFromExpoBundler();
  if (fromBundler && isPrivateLanIpv4(fromBundler)) return fromBundler;
  const fromDevHost = normalizeDevHost(process.env.EXPO_PUBLIC_DEV_HOST ?? "");
  if (fromDevHost && isPrivateLanIpv4(fromDevHost)) return fromDevHost;
  const fromApi = hostFromApiUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? "");
  if (fromApi && isPrivateLanIpv4(fromApi)) return fromApi;
  return null;
}

/**
 * getConfig() runs on nearly every render and request, so the heal below would log
 * thousands of identical lines. Report each distinct rewrite once per JS session.
 */
const loggedLanHeals = new Set<string>();

/**
 * Wi‑Fi IPs change often. In __DEV__, if a configured/overridden URL points at a
 * *different* private LAN IP than this PC's current host, rewrite so the phone
 * keeps talking to this machine (not a stale IP). Leaves production / ngrok alone.
 */
function healStaleLanApiUrl(url: string): string {
  if (!__DEV__) return url;
  const lan = preferredDevLanHost();
  if (!lan) return url;
  const host = hostFromApiUrl(url);
  if (!host || host === lan || !isPrivateLanIpv4(host)) return url;
  let port = apiDevPort();
  try {
    const parsed = new URL(url);
    if (parsed.port) port = parsed.port;
  } catch {
    /* keep apiDevPort() */
  }
  const healed = `http://${lan}:${port}`;
  const healKey = `${url}→${healed}`;
  if (!loggedLanHeals.has(healKey)) {
    loggedLanHeals.add(healKey);
    // Clear stale runtime override so env/.env.local wins next time (no repeat heal spam).
    if (runtimeApiBaseUrlOverride) {
      runtimeApiBaseUrlOverride = null;
    }
  }
  return healed;
}

/** True when a stored override is a private LAN IP that no longer matches this PC. */
export function isStaleLanApiOverride(storedUrl: string): boolean {
  if (!__DEV__) return false;
  const lan = preferredDevLanHost();
  if (!lan) return false;
  const host = hostFromApiUrl(storedUrl.trim().replace(/\/+$/, ""));
  return Boolean(host && host !== lan && isPrivateLanIpv4(host));
}

/** Map legacy dev ports (30000/4000) to Fastify default 3000. */
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

/** Replace localhost/127.0.0.1 with Android emulator host so backend on PC is reachable. */
function resolveApiBaseUrl(raw: string): string {
  const trimmed = normalizeLegacyBackendPort(raw.replace(/\/+$/, ""));
  if (!isLocalhostApiUrl(trimmed)) return trimmed;

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

/** Backend HTTP port — must match `PORT` in backend/.env (default 3000). */
function apiDevPort(): string {
  const raw = asNonEmptyString(process.env.EXPO_PUBLIC_API_PORT) ?? "3000";
  return raw === "30000" || raw === "4000" ? "3000" : raw;
}

export function getConfig(): {
  apiBaseUrl: string;
  wsBaseUrl: string;
  wsEnabled: boolean;
  mapboxAccessToken: string | null;
  /** Same token baked into native Maps via app.config.js (Android / iOS). */
  googleMapsApiKey: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  /** When true, OTP uses `POST /v1/auth/otp/request` (backend + MSG91). Default: Supabase hook (same as merchant). */
  phoneOtpUseBackendOnly: boolean;
  /**
   * Google Play review phone (E.164). When the login phone matches this, OTP is
   * forced through the backend path so the server-side review-mode short-circuit
   * (GOOGLE_REVIEW_*) applies instead of Supabase. Not a secret — the fixed OTP
   * stays server-side. Override via EXPO_PUBLIC_REVIEW_PHONE.
   */
  reviewPhone: string | null;
} {
  const port = apiDevPort();
  const fromEnv = asNonEmptyString(process.env.EXPO_PUBLIC_API_BASE_URL);
  const fromExtra =
    asNonEmptyString(
      (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.API_BASE_URL
    ) ??
    asNonEmptyString(
      (Constants.manifest2?.extra as Record<string, unknown> | undefined)?.API_BASE_URL
    );
  const devHostRaw = asNonEmptyString(process.env.EXPO_PUBLIC_DEV_HOST);
  const devHost = devHostRaw ? normalizeDevHost(devHostRaw) : null;

  // Production safety net: a release build with no baked-in URL must NOT
  // call localhost (unreachable from a phone). Fall back to the public domain.
  const releaseFallback = __DEV__ ? `http://localhost:${port}` : "https://api.gatimitra.com";

  let rawUrl: string;
  // Explicit LAN URL in .env.local wins over DEV_HOST (avoids stale/wrong DEV_HOST in .env).
  if (fromEnv && !isLocalhostApiUrl(fromEnv)) {
    rawUrl = fromEnv;
  } else if (devHost) {
    rawUrl = `http://${devHost}:${port}`;
  } else {
    rawUrl = fromEnv ?? fromExtra ?? releaseFallback;
  }

  // Runtime override (from AsyncStorage, set via the in-app "Configure API URL"
  // sheet) wins over env — then heal stale private LAN IPs to Metro's host.
  const apiBaseUrl = healStaleLanApiUrl(
    runtimeApiBaseUrlOverride ?? resolveApiBaseUrl(rawUrl)
  );

  const googleMapsApiKey =
    asNonEmptyString(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY as string) ??
    null;

  const mapboxAccessToken =
    asNonEmptyString(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN) ??
    asNonEmptyString(process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN) ??
    asNonEmptyString(process.env.MAPBOX_PUBLIC_TOKEN) ??
    asNonEmptyString(process.env.NEXT_PUBLIC_MAPBOX_TOKEN) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.mapboxAccessToken as string) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.MAPBOX_PUBLIC_TOKEN as string) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.NEXT_PUBLIC_MAPBOX_TOKEN as string) ??
    null;

  const supabaseUrl =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.EXPO_PUBLIC_SUPABASE_URL as string) ??
    null;
  const supabaseAnonKey =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.EXPO_PUBLIC_SUPABASE_ANON_KEY as string) ??
    null;

  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const phoneOtpBackendRaw =
    asNonEmptyString(process.env.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND) ??
    asNonEmptyString(extra?.EXPO_PUBLIC_PHONE_OTP_USE_BACKEND as string);
  const phoneOtpUseBackendOnly =
    phoneOtpBackendRaw === "1" ||
    phoneOtpBackendRaw?.toLowerCase() === "true" ||
    phoneOtpBackendRaw?.toLowerCase() === "yes" ||
    phoneOtpBackendRaw?.toLowerCase() === "on";

  /**
   * Google Play review phone (E.164). When set, this number uses the backend
   * OTP path so server-side GOOGLE_REVIEW_* can apply. Never hardcode a default
   * — omit the env var in normal builds so only real SMS OTPs work.
   */
  const reviewPhone =
    asNonEmptyString(process.env.EXPO_PUBLIC_REVIEW_PHONE) ??
    asNonEmptyString(extra?.EXPO_PUBLIC_REVIEW_PHONE as string) ??
    null;

  return {
    apiBaseUrl,
    wsBaseUrl: resolveWsBaseUrl(apiBaseUrl),
    wsEnabled: isCustomerWsEnabled(),
    mapboxAccessToken,
    googleMapsApiKey,
    supabaseUrl,
    supabaseAnonKey,
    phoneOtpUseBackendOnly,
    reviewPhone,
  };
}

/** Realtime weather + order sockets (ws-gateway). Disable when only REST backend is running. */
export function isCustomerWsEnabled(): boolean {
  const flag = process.env.EXPO_PUBLIC_WS_ENABLED?.trim().toLowerCase();
  if (flag === "false" || flag === "0" || flag === "no") return false;
  return true;
}

/** REST (:3000) and ws-gateway (:4100) are separate services in local dev. */
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
    return __DEV__ ? "ws://localhost:4100" : "wss://ws.gatimitra.com";
  }
}
