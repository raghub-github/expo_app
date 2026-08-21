/**
 * Native Mapbox for merchant tracking (Android/iOS MapView).
 * Expo Go has no native module — callers must show a fallback panel.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";
import { shouldUseNativeMapbox } from "@gatimitra/map-tracking-engine";
import { getConfig } from "@/config/env";

let initialized = false;
let isAvailable = false;

export function isMerchantExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export function initializeMerchantMapbox(): boolean {
  if (initialized) return isAvailable;

  if (
    !shouldUseNativeMapbox({
      appOwnership: Constants.appOwnership,
      platformOs: Platform.OS,
    })
  ) {
    initialized = true;
    isAvailable = false;
    return false;
  }

  const token = getConfig().mapboxPublicToken;
  if (!token) {
    initialized = true;
    isAvailable = false;
    return false;
  }

  try {
    const MapboxModule = require("@rnmapbox/maps");
    const Mapbox =
      MapboxModule.default && typeof MapboxModule.default.setAccessToken === "function"
        ? MapboxModule.default
        : typeof MapboxModule.setAccessToken === "function"
          ? MapboxModule
          : MapboxModule.Mapbox && typeof MapboxModule.Mapbox.setAccessToken === "function"
            ? MapboxModule.Mapbox
            : null;
    if (!Mapbox || typeof Mapbox.setAccessToken !== "function") {
      initialized = true;
      isAvailable = false;
      return false;
    }
    Mapbox.setAccessToken(token);
    initialized = true;
    isAvailable = true;
    return true;
  } catch {
    initialized = true;
    isAvailable = false;
    return false;
  }
}

export function isMerchantNativeMapboxAvailable(): boolean {
  if (!initialized) initializeMerchantMapbox();
  return isAvailable;
}

export function getMerchantMapboxModule(): {
  MapView: typeof import("react-native").View;
  Camera: unknown;
  ShapeSource: unknown;
  LineLayer: unknown;
  MarkerView?: unknown;
  PointAnnotation: unknown;
} | null {
  try {
    if (!shouldUseNativeMapbox({
      appOwnership: Constants.appOwnership,
      platformOs: Platform.OS,
    })) {
      return null;
    }
    if (!isMerchantNativeMapboxAvailable()) return null;
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
