/**
 * Background location task — MUST be required from app entry (index.js)
 * before Expo Router loads so TaskManager can register the handler.
 */
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";
import { Platform } from "react-native";
import { getItem } from "@/src/utils/storage";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { getRiderAppConfig } from "@/src/config/env";

export const RIDER_BACKGROUND_LOCATION_TASK = "RIDER_BACKGROUND_LOCATION_TASK";

const TOKEN_KEY = "gm_rider_access_token_v1";
const BG_TRACKING_FLAG_KEY = "gm_rider_bg_tracking_v1";

type BgTrackingMode = "off" | "duty" | "active_order";

async function readBgMode(): Promise<BgTrackingMode> {
  try {
    const raw = await getItem(BG_TRACKING_FLAG_KEY);
    if (raw === "duty" || raw === "active_order") return raw;
  } catch {
    /* ignore */
  }
  return "off";
}

export async function setRiderBackgroundTrackingMode(mode: BgTrackingMode): Promise<void> {
  const { setItem, removeItem } = await import("@/src/utils/storage");
  if (mode === "off") {
    await removeItem(BG_TRACKING_FLAG_KEY);
    return;
  }
  await setItem(BG_TRACKING_FLAG_KEY, mode);
}

async function pingFromBackground(fix: {
  tsMs: number;
  lat: number;
  lng: number;
  accuracyM?: number;
  speedMps?: number;
  headingDeg?: number;
}): Promise<void> {
  const mode = await readBgMode();
  if (mode === "off") return;

  const token = await getItem(TOKEN_KEY);
  if (!token) return;

  const deviceId = await getOrCreateDeviceId();
  const { apiBaseUrl } = getRiderAppConfig();
  const url = `${apiBaseUrl.replace(/\/+$/, "")}/v1/rider/location/ping`;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tsMs: fix.tsMs,
        lat: fix.lat,
        lng: fix.lng,
        accuracyM: fix.accuracyM,
        speedMps: fix.speedMps,
        headingDeg: fix.headingDeg,
        provider: "background",
        deviceId,
      }),
    });
  } catch {
    /* OS may kill network briefly — next update retries */
  }

  // Mirror into shared engine when the JS runtime is awake.
  try {
    const { getSharedLocationEngine } = await import("@gatimitra/expo-location-kit");
    getSharedLocationEngine().ingestExternalFix({
      tsMs: fix.tsMs,
      lat: fix.lat,
      lng: fix.lng,
      accuracyM: fix.accuracyM,
      speedMps: fix.speedMps,
      headingDeg: fix.headingDeg,
      provider: "background",
    });
  } catch {
    /* kit may be unavailable in isolated task context on some devices */
  }
}

if (!TaskManager.isTaskDefined(RIDER_BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(RIDER_BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    if (!locations?.length) return;
    const loc = locations[locations.length - 1];
    if (!loc?.coords) return;
    const c = loc.coords;
    await pingFromBackground({
      tsMs: loc.timestamp ?? Date.now(),
      lat: c.latitude,
      lng: c.longitude,
      accuracyM: c.accuracy ?? undefined,
      speedMps: c.speed ?? undefined,
      headingDeg: c.heading ?? undefined,
    });
  });
}

export async function startRiderBackgroundLocation(mode: "duty" | "active_order"): Promise<boolean> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== "granted") return false;

    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== "granted") {
      const req = await Location.requestBackgroundPermissionsAsync();
      if (req.status !== "granted") return false;
    }

    await setRiderBackgroundTrackingMode(mode);

    const started = await Location.hasStartedLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
    if (started) {
      // Restart with the right frequency when mode changes.
      await Location.stopLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK).catch(() => {});
    }

    const active = mode === "active_order";
    await Location.startLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK, {
      accuracy: active ? Location.Accuracy.High : Location.Accuracy.Balanced,
      timeInterval: active ? 5_000 : 15_000,
      distanceInterval: active ? 8 : 25,
      deferredUpdatesInterval: active ? 5_000 : 15_000,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      ...(Platform.OS === "android"
        ? {
            foregroundService: {
              notificationTitle: "GatiMitra Rider",
              notificationBody: active
                ? "Navigation is active to help you complete your order."
                : "You're all set! Waiting for your next order.",
              notificationColor: "#0f172a",
            },
          }
        : {}),
    });
    return true;
  } catch (err) {
    console.warn("[rider-bg-location] start failed", err);
    return false;
  }
}

export async function stopRiderBackgroundLocation(): Promise<void> {
  try {
    await setRiderBackgroundTrackingMode("off");
    const started = await Location.hasStartedLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
    if (started) {
      await Location.stopLocationUpdatesAsync(RIDER_BACKGROUND_LOCATION_TASK);
    }
  } catch (err) {
    console.warn("[rider-bg-location] stop failed", err);
  }
}

/**
 * After process death / Doze kill: if the mode flag says we should still track,
 * restart the OS background updates (called on cold start + app foreground).
 */
export async function ensureRiderBackgroundLocationRunning(): Promise<void> {
  const mode = await readBgMode();
  if (mode === "off") return;
  await startRiderBackgroundLocation(mode);
}
