/**
 * Mapbox integration for GatiMitra Rider App (Web platform)
 * Mapbox is not supported on web, so this provides empty implementations
 */

export function initializeMapbox() {
  console.log("[Mapbox] Skipping initialization on web platform");
  return false;
}

export function isMapboxAvailable(): boolean {
  return false;
}

export function getMapboxModule() {
  return null;
}

