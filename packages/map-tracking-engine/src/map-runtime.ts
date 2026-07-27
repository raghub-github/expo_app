/**
 * Shared map environment selection for Customer / Rider / Merchant.
 *
 * Policy (do not use `__DEV__` for map selection):
 * - Expo Go → lightweight fallback only (no native Mapbox)
 * - Development build (custom client) → same native Mapbox as production
 * - Production APK/AAB/App Store → native Mapbox
 */

export type MapRuntimeKind = "native_mapbox" | "expo_go_fallback" | "unavailable";

export type MapRuntimeReason =
  | "ok"
  | "expo_go"
  | "missing_token"
  | "native_module_missing"
  | "web";

/** True when running inside Expo Go (no custom native modules). */
export function isExpoGoRuntime(appOwnership: string | null | undefined): boolean {
  return appOwnership === "expo";
}

/**
 * Whether this binary should load `@rnmapbox/maps`.
 * Dev clients and store builds return true; Expo Go returns false.
 * Never gate on `__DEV__` — that would make Metro-debug builds skip Mapbox incorrectly.
 */
export function shouldUseNativeMapbox(args: {
  appOwnership: string | null | undefined;
  platformOs: string;
}): boolean {
  if (args.platformOs === "web") return false;
  if (isExpoGoRuntime(args.appOwnership)) return false;
  return true;
}

export function resolveMapRuntimeKind(args: {
  appOwnership: string | null | undefined;
  platformOs: string;
  tokenPresent: boolean;
  nativeModulePresent: boolean;
}): { kind: MapRuntimeKind; reason: MapRuntimeReason } {
  if (args.platformOs === "web") {
    return { kind: "unavailable", reason: "web" };
  }
  if (isExpoGoRuntime(args.appOwnership)) {
    return { kind: "expo_go_fallback", reason: "expo_go" };
  }
  if (!args.tokenPresent) {
    return { kind: "unavailable", reason: "missing_token" };
  }
  if (!args.nativeModulePresent) {
    return { kind: "unavailable", reason: "native_module_missing" };
  }
  return { kind: "native_mapbox", reason: "ok" };
}

/** Resolve Mapbox public token from all env aliases used across GatiMitra apps. */
export function resolveMapboxPublicTokenFromEnv(
  env: Record<string, string | undefined>,
  extra?: Record<string, unknown> | null
): string | undefined {
  const pick = (v: unknown): string | undefined => {
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    return s.length > 0 ? s : undefined;
  };

  return (
    pick(env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN) ??
    pick(env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN) ??
    pick(env.MAPBOX_PUBLIC_TOKEN) ??
    pick(env.NEXT_PUBLIC_MAPBOX_TOKEN) ??
    pick(extra?.mapboxPublicToken) ??
    pick(extra?.mapboxAccessToken) ??
    pick(extra?.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN) ??
    pick(extra?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN) ??
    pick(extra?.MAPBOX_PUBLIC_TOKEN) ??
    pick(extra?.NEXT_PUBLIC_MAPBOX_TOKEN) ??
    undefined
  );
}
