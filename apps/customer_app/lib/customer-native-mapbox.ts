/**
 * Native Mapbox for customer maps (Android/iOS MapView).
 * Expo Go has no native module — callers show CustomerMapUnavailable.
 */
import Constants from "expo-constants";
import { Platform } from "react-native";
import { shouldUseNativeMapbox } from "@gatimitra/map-tracking-engine";
import { getConfig } from "@/config/env";

let initialized = false;
let isAvailable = false;

export function isCustomerExpoGo(): boolean {
  return Constants.appOwnership === "expo";
}

export function initializeCustomerMapbox(): boolean {
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

  const token = getConfig().mapboxAccessToken?.trim() ?? "";
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

export function isCustomerNativeMapboxAvailable(): boolean {
  if (!initialized) initializeCustomerMapbox();
  return isAvailable;
}

export function getCustomerMapboxModule(): any | null {
  try {
    if (
      !shouldUseNativeMapbox({
        appOwnership: Constants.appOwnership,
        platformOs: Platform.OS,
      })
    ) {
      return null;
    }
    if (!isCustomerNativeMapboxAvailable()) return null;
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
