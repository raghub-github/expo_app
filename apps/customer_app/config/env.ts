import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * App config from env. EXPO_PUBLIC_* only in bundle.
 * On Android emulator, localhost is rewritten to 10.0.2.2 so the app can reach the host machine.
 */

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

/** Replace localhost/127.0.0.1 with Android emulator host so backend on PC is reachable. */
function resolveApiBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  if (Platform.OS === "android" && (/^https?:\/\/localhost(\b|:)/.test(trimmed) || /^https?:\/\/127\.0\.0\.1(\b|:)/.test(trimmed))) {
    return trimmed.replace(/localhost|127\.0\.0\.1/, "10.0.2.2");
  }
  return trimmed;
}

export function getConfig(): {
  apiBaseUrl: string;
  mapboxAccessToken: string | null;
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
} {
  // Physical device: set EXPO_PUBLIC_DEV_HOST to your PC's IP (from ipconfig) to reach backend
  const devHost = asNonEmptyString(process.env.EXPO_PUBLIC_DEV_HOST);
  let rawUrl: string;
  if (devHost) {
    const host = devHost.replace(/^https?:\/\//, "").split("/")[0].replace(/:\d+$/, "");
    rawUrl = `http://${host}:3001`;
  } else {
    const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
    const fromExtra =
      (Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.API_BASE_URL ??
      (Constants.manifest2?.extra as Record<string, unknown> | undefined)?.API_BASE_URL;
    rawUrl =
      asNonEmptyString(fromEnv) ??
      asNonEmptyString(fromExtra) ??
      "http://localhost:3001";
  }

  const apiBaseUrl = resolveApiBaseUrl(rawUrl);

  const mapboxAccessToken =
    asNonEmptyString(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN as string) ??
    null;

  const supabaseUrl =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_URL) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.EXPO_PUBLIC_SUPABASE_URL as string) ??
    null;
  const supabaseAnonKey =
    asNonEmptyString(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ??
    asNonEmptyString((Constants.expoConfig?.extra as Record<string, unknown> | undefined)?.EXPO_PUBLIC_SUPABASE_ANON_KEY as string) ??
    null;

  return {
    apiBaseUrl,
    mapboxAccessToken,
    supabaseUrl,
    supabaseAnonKey,
  };
}
