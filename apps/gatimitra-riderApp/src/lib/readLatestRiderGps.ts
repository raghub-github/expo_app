import { getSharedLocationEngine } from "@/src/services/location/locationTracker";
import { useHomeMapLocationStore } from "@/src/stores/homeMapLocationStore";
import { useRiderLocationStore } from "@/src/stores/riderLocationStore";
import { isUsableMapCoordinate } from "@/src/lib/map-coordinates";

export type LatestRiderGps = {
  lat: number;
  lng: number;
  accuracyM?: number;
  speedMps?: number;
  headingDeg?: number;
  tsMs: number;
};

export { isUsableMapCoordinate };

const STALE_GPS_MS = 10 * 60_000;

/** Remembered camera center so remounted MapViews never open on the world. */
let lastMapCameraCenter: { lat: number; lng: number } | null = null;

export function rememberMapCameraCenter(lat: number, lng: number): void {
  if (!isUsableMapCoordinate(lat, lng)) return;
  lastMapCameraCenter = { lat, lng };
}

export function readLastMapCameraCenter(): { lat: number; lng: number } | null {
  return lastMapCameraCenter;
}

export function isGpsFixFresh(tsMs?: number, nowMs = Date.now()): boolean {
  if (tsMs == null || !Number.isFinite(tsMs)) return false;
  return nowMs - tsMs <= STALE_GPS_MS;
}

/**
 * Single read path for any map screen: shared GPS engine, then home pin, then
 * rider location store, then last camera center.
 */
export function readLatestRiderGps(): LatestRiderGps | null {
  const engine = getSharedLocationEngine();
  const engineFix =
    typeof engine.getLastFix === "function" ? engine.getLastFix() : undefined;
  if (engineFix && isUsableMapCoordinate(engineFix.lat, engineFix.lng)) {
    rememberMapCameraCenter(engineFix.lat, engineFix.lng);
    return {
      lat: engineFix.lat,
      lng: engineFix.lng,
      accuracyM: engineFix.accuracyM,
      speedMps: engineFix.speedMps,
      headingDeg: engineFix.headingDeg,
      tsMs: engineFix.tsMs,
    };
  }

  const home = useHomeMapLocationStore.getState().fix;
  if (home && isUsableMapCoordinate(home.lat, home.lng)) {
    rememberMapCameraCenter(home.lat, home.lng);
    return {
      lat: home.lat,
      lng: home.lng,
      accuracyM: home.accuracyM,
      speedMps: home.speedMps,
      headingDeg: home.heading,
      tsMs: home.tsMs,
    };
  }

  const rider = useRiderLocationStore.getState();
  if (rider.coords && isUsableMapCoordinate(rider.coords.latitude, rider.coords.longitude)) {
    rememberMapCameraCenter(rider.coords.latitude, rider.coords.longitude);
    return {
      lat: rider.coords.latitude,
      lng: rider.coords.longitude,
      accuracyM: rider.coords.accuracy ?? undefined,
      tsMs: rider.updatedAtMs ?? Date.now(),
    };
  }

  const remembered = lastMapCameraCenter;
  if (remembered) {
    return { lat: remembered.lat, lng: remembered.lng, tsMs: 0 };
  }

  return null;
}
