/**
 * Mapbox integration for GatiMitra Rider (iOS/Android).
 *
 * Development builds and production use the same native `@rnmapbox/maps` path.
 * Expo Go has no native Mapbox — maps show an explicit fallback panel instead.
 * Do not gate on `__DEV__`.
 */

import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  shouldUseNativeMapbox,
  resolveMapRuntimeKind,
  type MapRuntimeKind,
  type MapRuntimeReason,
} from "@gatimitra/map-tracking-engine";
import { getRiderAppConfig } from "../../config/env";
import { resolveMapboxPublicToken } from "../../lib/mapbox-env";

let initialized = false;
let isAvailable = false;
let lastReason: MapRuntimeReason = "native_module_missing";

export function getMapRuntimeDiagnostics(): {
  kind: MapRuntimeKind;
  reason: MapRuntimeReason;
  available: boolean;
  tokenPresent: boolean;
  isExpoGo: boolean;
} {
  const tokenPresent = !!resolveMapboxPublicToken();
  const { kind, reason } = resolveMapRuntimeKind({
    appOwnership: Constants.appOwnership,
    platformOs: Platform.OS,
    tokenPresent,
    nativeModulePresent: isAvailable,
  });
  return {
    kind,
    reason: initialized ? lastReason : reason,
    available: isAvailable,
    tokenPresent,
    isExpoGo: Constants.appOwnership === "expo",
  };
}

export function initializeMapbox() {
  if (initialized) return isAvailable;

  if (
    !shouldUseNativeMapbox({
      appOwnership: Constants.appOwnership,
      platformOs: Platform.OS,
    })
  ) {
    initialized = true;
    isAvailable = false;
    lastReason = Constants.appOwnership === "expo" ? "expo_go" : "web";
    console.log("[Mapbox] Skipping native init (Expo Go / web). Use a development build for navigation testing.");
    return false;
  }

  const cfg = getRiderAppConfig();
  const token = cfg.mapboxToken ?? resolveMapboxPublicToken();

  console.log("[Mapbox] Initialization check:", {
    hasToken: !!token,
    tokenLength: token?.length || 0,
    tokenPrefix: token?.substring(0, 15) || "N/A",
    appOwnership: Constants.appOwnership,
    __DEV__,
  });

  if (!token) {
    console.error(
      "[Mapbox] Token not configured. Set EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN or EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN."
    );
    initialized = true;
    isAvailable = false;
    lastReason = "missing_token";
    return false;
  }

  if (!token.startsWith("pk.")) {
    console.warn("[Mapbox] Token format appears invalid. Public tokens should start with 'pk.'");
  }

  try {
    let MapboxModule;
    try {
      MapboxModule = require("@rnmapbox/maps");
    } catch (requireError: unknown) {
      const errorMsg = String((requireError as Error)?.message ?? requireError);
      const isNativeCodeError =
        errorMsg.includes("native code not available") ||
        errorMsg.includes("RNMBXModule");
      initialized = true;
      isAvailable = false;
      lastReason = "native_module_missing";
      if (!isNativeCodeError) {
        console.error("[Mapbox] require(@rnmapbox/maps) failed:", errorMsg);
      }
      return false;
    }

    if (!MapboxModule) {
      initialized = true;
      isAvailable = false;
      lastReason = "native_module_missing";
      return false;
    }

    let Mapbox =
      MapboxModule.default && typeof MapboxModule.default.setAccessToken === "function"
        ? MapboxModule.default
        : typeof MapboxModule.setAccessToken === "function"
          ? MapboxModule
          : MapboxModule.Mapbox && typeof MapboxModule.Mapbox.setAccessToken === "function"
            ? MapboxModule.Mapbox
            : null;

    if (!Mapbox || typeof Mapbox.setAccessToken !== "function") {
      console.error("[Mapbox] Invalid module — setAccessToken not found");
      initialized = true;
      isAvailable = false;
      lastReason = "native_module_missing";
      return false;
    }

    Mapbox.setAccessToken(token);
    initialized = true;
    isAvailable = true;
    lastReason = "ok";
    console.log("[Mapbox] Native Mapbox ready (same path as production). tokenLength=", token.length);
    return true;
  } catch (error: unknown) {
    console.error("[Mapbox] Initialization failed:", (error as Error)?.message ?? error);
    initialized = true;
    isAvailable = false;
    lastReason = "native_module_missing";
    return false;
  }
}

export function isMapboxAvailable(): boolean {
  if (!initialized) initializeMapbox();
  return isAvailable;
}

export function getMapboxModule(): ReturnType<typeof require> | null {
  try {
    if (!shouldUseNativeMapbox({ appOwnership: Constants.appOwnership, platformOs: Platform.OS })) {
      return null;
    }
    if (!isMapboxAvailable()) return null;
    const mapboxModule = require("@rnmapbox/maps");
    let mapbox = mapboxModule;
    if (mapboxModule?.default) mapbox = mapboxModule.default;
    else if (mapboxModule?.Mapbox) mapbox = mapboxModule.Mapbox;
    if (!mapbox?.MapView) return null;
    return mapbox;
  } catch {
    return null;
  }
}
