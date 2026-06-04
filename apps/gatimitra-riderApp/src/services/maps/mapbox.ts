/**
 * Mapbox integration entry.
 * Metro resolves mapbox.native.ts / mapbox.web.ts at bundle time; this file
 * provides an explicit typed API surface for TypeScript and tooling.
 */
import {
  initializeMapbox as initializeMapboxNative,
  isMapboxAvailable as isMapboxAvailableNative,
  getMapboxModule as getMapboxModuleNative,
} from "./mapbox.native";

export function initializeMapbox(): boolean {
  return initializeMapboxNative();
}

export function isMapboxAvailable(): boolean {
  return isMapboxAvailableNative();
}

export function getMapboxModule(): ReturnType<typeof getMapboxModuleNative> {
  return getMapboxModuleNative();
}
