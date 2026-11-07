/**
 * Session-level location bootstrap — independent of splash and Home mount.
 *
 * Stage A: hydrate last-known device location (instant header paint).
 * Stage B: permission popup if needed, else fast GPS + reverse geocode.
 *
 * Never blocks Home. Never starts a second continuous watcher.
 */

import type { QueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { useLocationStore, getDeviceLocationReadiness } from "@/store/locationStore";
import { useSmsPermissionStore } from "@/store/smsPermissionStore";
import { runExclusiveActiveLocationReconcile } from "@/lib/activeLocationReconcileGate";
import { reconcileActiveLocationFromGps } from "@/lib/reconcileActiveLocationFromGps";
import { coordsMovedSignificantly } from "@gatimitra/expo-location-kit";
import { debouncedInvalidateFoodHomeListingQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import { restoreAndPrefetchLocationWeather } from "@/hooks/useLocationWeather";
import { startupLaunchLog } from "@/lib/startupPerf";

let stageAStarted = false;
let stageBStarted = false;
let gpsWatchdog: ReturnType<typeof setTimeout> | null = null;

/** Only after GPS fetch has started — never while permission sheet is up. */
const GPS_FETCH_TIMEOUT_MS = 20_000;

function isPlaceholder(primary?: string | null): boolean {
  const t = primary?.trim().toLowerCase() ?? "";
  return !t || t === "current location" || t.startsWith("detecting");
}

function hasUsableAddress(): boolean {
  const s = useLocationStore.getState();
  return Boolean(s.coords) && Boolean(s.address?.primary) && !isPlaceholder(s.address?.primary);
}

function clearGpsWatchdog(): void {
  if (gpsWatchdog) {
    clearTimeout(gpsWatchdog);
    gpsWatchdog = null;
  }
}

function armGpsFetchWatchdog(): void {
  clearGpsWatchdog();
  gpsWatchdog = setTimeout(() => {
    gpsWatchdog = null;
    const s = useLocationStore.getState();
    if (hasUsableAddress()) return;
    // Permission granted but GPS hung — allow retry CTA, not a fake address.
    if (s.permissionStatus === "granted") {
      useLocationStore.setState({ detectingTimedOut: true, loading: false });
      startupLaunchLog("LOCATION_DETECTING_TIMEOUT", {
        reason: "gps_fetch_timeout",
        ageBudgetMs: GPS_FETCH_TIMEOUT_MS,
      });
    }
  }, GPS_FETCH_TIMEOUT_MS);
}

/** Stage A — cache only. Safe before auth. */
export async function bootstrapLastKnownLocation(): Promise<void> {
  if (stageAStarted) return;
  stageAStarted = true;
  startupLaunchLog("LOCATION_INIT_START", { stage: "last_known" });
  const t0 = Date.now();
  try {
    // Weather disk → memory before locationHydrated flips so Home paints cache, not skeleton.
    const { ensureWeatherCacheHydrated } = await import("@/lib/weatherCacheStorage");
    await ensureWeatherCacheHydrated();
  } catch {
    /* non-fatal */
  }
  try {
    await useLocationStore.getState().hydrate();
  } catch {
    /* non-fatal */
  }
  const { coords, address, locationFreshness } = useLocationStore.getState();
  startupLaunchLog("LAST_KNOWN_LOCATION_RESULT", {
    durationMs: Date.now() - t0,
    hasCoords: Boolean(coords),
    hasAddress: Boolean(address?.primary) && !isPlaceholder(address?.primary),
    freshness: locationFreshness,
  });
  // Do NOT arm Tap-to-set timeout here — permission/GPS have not started yet.
}

/**
 * Stage B — show location popup if permission/services off; otherwise fetch ASAP.
 * Call once auth hydration has published (session may be null for logged-out).
 */
export async function bootstrapFreshDeviceLocation(queryClient: QueryClient): Promise<void> {
  if (stageBStarted) return;
  stageBStarted = true;
  startupLaunchLog("LOCATION_INIT_START", { stage: "fresh_gps" });

  await runExclusiveActiveLocationReconcile(async () => {
    await useLocationStore.getState().hydrate();

    // SMS sheet owns the screen first — keep last-known painted; resume after SMS.
    if (useSmsPermissionStore.getState().allowInFlight) {
      stageBStarted = false; // allow retry when SMS clears
      startupLaunchLog("LOCATION_PERMISSION_RESULT", { deferred: "sms_in_flight" });
      return "deferred";
    }
    if (useAuthStore.getState().session?.accessToken) {
      const smsOk = await useSmsPermissionStore.getState().promptSmsPermissionIfNeeded();
      if (!smsOk && useSmsPermissionStore.getState().blocksLocation) {
        stageBStarted = false;
        startupLaunchLog("LOCATION_PERMISSION_RESULT", { deferred: "sms_blocks_location" });
        return "deferred";
      }
    }

    const readiness = await getDeviceLocationReadiness();
    startupLaunchLog("LOCATION_PERMISSION_RESULT", {
      status: readiness.permissionStatus,
      servicesEnabled: readiness.servicesEnabled,
      isReady: readiness.isReady,
    });

    if (!readiness.isReady) {
      // Popup so the user can enable permission / device location.
      useLocationStore.setState({
        permissionStatus: readiness.permissionStatus,
        showPermissionModal: true,
        locationSheetDismissedSession: false,
        loading: false,
        // Keep "Enable location" / modal — not a premature Tap-to-set from cache miss.
        detectingTimedOut: false,
      });
      if (useAuthStore.getState().session) {
        const { applyActiveLocationFromBackend } = await import(
          "@/lib/applyActiveLocationFromBackend"
        );
        await applyActiveLocationFromBackend(queryClient);
      }
      const { coords, address } = useLocationStore.getState();
      if (coords) {
        void restoreAndPrefetchLocationWeather(queryClient, address, coords);
      }
      return "done";
    }

    // Permission + services ON → fetch current location ASAP (no Tap-to-set).
    useLocationStore.setState({
      permissionStatus: "granted",
      showPermissionModal: false,
      detectingTimedOut: false,
      loading: true,
    });

    startupLaunchLog("GPS_FETCH_START");
    armGpsFetchWatchdog();
    const gpsT0 = Date.now();
    try {
      await useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
    } finally {
      clearGpsWatchdog();
      startupLaunchLog("GPS_FETCH_DONE", { durationMs: Date.now() - gpsT0 });
      if (hasUsableAddress()) {
        useLocationStore.setState({ detectingTimedOut: false, loading: false });
      }
    }

    {
      const { coords, address } = useLocationStore.getState();
      if (coords) {
        void restoreAndPrefetchLocationWeather(queryClient, address, coords);
      }
    }

    const before = useLocationStore.getState().coords;
    if (useAuthStore.getState().session) {
      void reconcileActiveLocationFromGps(queryClient).then((reconciled) => {
        if (__DEV__) {
          console.log("[active-location] cold_start_decision", {
            path: "sessionLocationBootstrap",
            addressId: reconciled?.addressId ?? null,
            source: reconciled?.source ?? null,
            reason: reconciled?.reason ?? null,
            distanceM: reconciled?.distanceM ?? null,
            retentionRadiusM: reconciled?.retentionRadiusM ?? null,
          });
        }
        const after = useLocationStore.getState();
        if (after.coords) {
          void restoreAndPrefetchLocationWeather(queryClient, after.address, after.coords);
        }
        if (
          coordsMovedSignificantly(before, after.coords) ||
          reconciled?.switchedToCurrent ||
          reconciled?.source === "selected"
        ) {
          debouncedInvalidateFoodHomeListingQueries(queryClient);
        }
      });
    }

    return "done";
  });
}

/** Reset on logout / account switch so the next session can bootstrap again. */
export function resetSessionLocationBootstrap(): void {
  stageAStarted = false;
  stageBStarted = false;
  clearGpsWatchdog();
}
