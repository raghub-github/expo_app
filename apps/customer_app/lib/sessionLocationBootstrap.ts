/**
 * Session-level location bootstrap — independent of splash and Home mount.
 *
 * Stage A: hydrate last-known device location (instant header paint).
 * Stage B: permission popup if needed, else progressive GPS + reverse geocode.
 *
 * Never blocks Home. Never starts a second continuous watcher.
 * Never force-GPS over an explicit selected delivery address before reconcile.
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
let earlyGpsKicked = false;
let gpsWatchdog: ReturnType<typeof setTimeout> | null = null;

/** Fresh-address SLA — stop "Detecting…" after this even if GPS is weak. */
const GPS_FETCH_TIMEOUT_MS = 7_000;

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
        blocksHome: false,
      });
    }
  }, GPS_FETCH_TIMEOUT_MS);
}

function logHomeLocationVisible(reason: string): void {
  const s = useLocationStore.getState();
  startupLaunchLog("HOME_LOCATION_VISIBLE", {
    reason,
    hasCoords: Boolean(s.coords),
    hasAddress: Boolean(s.address?.primary) && !isPlaceholder(s.address?.primary),
    locationSource: s.locationSource,
    freshness: s.locationFreshness,
    blocksHome: false,
  });
}

/**
 * Start progressive GPS as soon as permission+services are already ready —
 * does not wait for splash, weather, cart, profile, or reverse geocode.
 * Never shows permission UI (that stays in Stage B after splash).
 * Never forceDevice over an explicit selected delivery pin.
 */
export async function kickEarlyFreshGpsIfReady(): Promise<void> {
  if (earlyGpsKicked || stageBStarted) return;
  const loc = useLocationStore.getState();
  if (loc.locationSource === "selected" && loc.coords) {
    earlyGpsKicked = true;
    startupLaunchLog("GPS_EARLY_KICK", {
      skipped: "selected_delivery_pin",
      blocksHome: false,
    });
    return;
  }

  let readiness;
  try {
    // Hard ceiling — Expo Go permission probes can hang; retries cover misses.
    readiness = await Promise.race([
      getDeviceLocationReadiness(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("readiness_timeout")), 2_500)
      ),
    ]);
  } catch (e) {
    startupLaunchLog("GPS_EARLY_KICK", {
      skipped: "readiness_error",
      message: e instanceof Error ? e.message : "unknown",
      blocksHome: false,
    });
    // Do not mark kicked — retry after auth / splash.
    return;
  }
  if (!readiness.isReady) {
    startupLaunchLog("GPS_EARLY_KICK", {
      skipped: "permission_or_services_off",
      status: readiness.permissionStatus,
      blocksHome: false,
    });
    return;
  }

  earlyGpsKicked = true;
  startupLaunchLog("GPS_EARLY_KICK", {
    // Never force over a pin — Stage B / setAddressAndCoords own selected delivery.
    forceDevice: false,
    hadCachedCoords: Boolean(loc.coords),
    locationSource: loc.locationSource,
    blocksHome: false,
  });
  // Fire-and-forget — splash/Home/SMS must not await TTFF when permission is already on.
  void useLocationStore.getState().requestPermissionAndFetch({ forceDevice: false });
}

/** Stage A — cache only. Safe before auth. */
export async function bootstrapLastKnownLocation(): Promise<void> {
  if (stageAStarted) return;
  stageAStarted = true;
  startupLaunchLog("LOCATION_INIT_START", {
    stage: "last_known",
    blocksHome: false,
  });
  const t0 = Date.now();
  // Weather must NEVER sit on the last-known critical path.
  void import("@/lib/weatherCacheStorage")
    .then((m) => m.ensureWeatherCacheHydrated())
    .catch(() => {});

  const boot = useLocationStore.getState();
  if (boot.locationHydrated && boot.coords) {
    const durationMs = Date.now() - t0;
    startupLaunchLog("CACHED_LOCATION_RESTORE", {
      durationMs,
      hasCoords: true,
      hasAddress: Boolean(boot.address?.primary) && !isPlaceholder(boot.address?.primary),
      freshness: boot.locationFreshness,
      source: "boot_peek",
      blocksHome: false,
    });
    startupLaunchLog("LAST_KNOWN_LOCATION_RESULT", {
      durationMs,
      hasCoords: true,
      hasAddress: Boolean(boot.address?.primary) && !isPlaceholder(boot.address?.primary),
      freshness: boot.locationFreshness,
      source: "boot_peek",
      blocksHome: false,
    });
    logHomeLocationVisible("boot_peek");
    return;
  }

  try {
    await useLocationStore.getState().hydrate();
  } catch {
    /* non-fatal */
  }
  const { coords, address, locationFreshness } = useLocationStore.getState();
  const durationMs = Date.now() - t0;
  startupLaunchLog("CACHED_LOCATION_RESTORE", {
    durationMs,
    hasCoords: Boolean(coords),
    hasAddress: Boolean(address?.primary) && !isPlaceholder(address?.primary),
    freshness: locationFreshness,
    source: "hydrate",
    blocksHome: false,
  });
  startupLaunchLog("LAST_KNOWN_LOCATION_RESULT", {
    durationMs,
    hasCoords: Boolean(coords),
    hasAddress: Boolean(address?.primary) && !isPlaceholder(address?.primary),
    freshness: locationFreshness,
    source: "hydrate",
    blocksHome: false,
  });
  if (coords) logHomeLocationVisible("hydrate");
}

/**
 * Stage B — show location popup if permission/services off; otherwise fetch ASAP.
 * Call once auth hydration has published (session may be null for logged-out).
 *
 * Order matters for delivery safety:
 * 1) Restore backend-bound selected address (if any).
 * 2) Only then progressive GPS — never forceDevice over an explicit selection.
 * 3) Reconcile per existing hyperlocal rules (may switch when far / policy says so).
 */
export async function bootstrapFreshDeviceLocation(queryClient: QueryClient): Promise<void> {
  if (stageBStarted) return;
  stageBStarted = true;
  startupLaunchLog("LOCATION_INIT_START", { stage: "fresh_gps", blocksHome: false });

  await runExclusiveActiveLocationReconcile(async () => {
    await useLocationStore.getState().hydrate();

    const readiness = await getDeviceLocationReadiness();
    startupLaunchLog("LOCATION_PERMISSION_RESULT", {
      status: readiness.permissionStatus,
      servicesEnabled: readiness.servicesEnabled,
      isReady: readiness.isReady,
      blocksHome: false,
    });

    // Permission already on → start GPS now. SMS must never hold a granted refine.
    if (!readiness.isReady) {
      // SMS sheet owns the screen first — keep last-known painted; resume after SMS.
      if (useSmsPermissionStore.getState().allowInFlight) {
        stageBStarted = false; // allow retry when SMS clears
        startupLaunchLog("LOCATION_PERMISSION_RESULT", {
          deferred: "sms_in_flight",
          blocksHome: false,
        });
        return "deferred";
      }
      if (useAuthStore.getState().session?.accessToken) {
        const smsOk = await useSmsPermissionStore.getState().promptSmsPermissionIfNeeded();
        if (!smsOk && useSmsPermissionStore.getState().blocksLocation) {
          stageBStarted = false;
          startupLaunchLog("LOCATION_PERMISSION_RESULT", {
            deferred: "sms_blocks_location",
            blocksHome: false,
          });
          return "deferred";
        }
      }
      useLocationStore.setState({
        permissionStatus: readiness.permissionStatus,
        showPermissionModal: true,
        locationSheetDismissedSession: false,
        loading: false,
        detectingTimedOut: false,
      });
      if (useAuthStore.getState().session) {
        const { applyActiveLocationFromBackend } = await import(
          "@/lib/applyActiveLocationFromBackend"
        );
        await applyActiveLocationFromBackend(queryClient);
        logHomeLocationVisible("backend_selected_while_permission_off");
      }
      const { coords, address } = useLocationStore.getState();
      if (coords) {
        void restoreAndPrefetchLocationWeather(queryClient, address, coords);
      }
      return "done";
    }

    // Permission + services ON.
    useLocationStore.setState({
      permissionStatus: "granted",
      showPermissionModal: false,
      detectingTimedOut: false,
    });

    // Start progressive GPS immediately — do not wait on backend selected restore.
    // If backend later binds a selected pin, setAddressAndCoords invalidates GPS commits.
    const beforeGps = useLocationStore.getState();
    const forceDevice = !(
      beforeGps.locationSource === "selected" &&
      beforeGps.coords != null &&
      Boolean(beforeGps.address?.primary) &&
      !isPlaceholder(beforeGps.address?.primary)
    ) && !beforeGps.coords;

    useLocationStore.setState({ loading: !beforeGps.coords });
    startupLaunchLog("GPS_FETCH_START", {
      forceDevice,
      hadCachedCoords: Boolean(beforeGps.coords),
      locationSource: beforeGps.locationSource,
      parallelBackend: Boolean(useAuthStore.getState().session),
      blocksHome: false,
    });
    armGpsFetchWatchdog();
    const gpsT0 = Date.now();
    const gpsPromise = useLocationStore
      .getState()
      .requestPermissionAndFetch({ forceDevice: forceDevice });

    if (useAuthStore.getState().session) {
      try {
        const { applyActiveLocationFromBackend } = await import(
          "@/lib/applyActiveLocationFromBackend"
        );
        await applyActiveLocationFromBackend(queryClient);
        const afterBackend = useLocationStore.getState();
        if (afterBackend.coords) {
          logHomeLocationVisible("backend_active_parallel_gps");
          void restoreAndPrefetchLocationWeather(
            queryClient,
            afterBackend.address,
            afterBackend.coords
          );
        }
      } catch {
        /* non-fatal — GPS path continues */
      }
    }

    const preserveSelected =
      useLocationStore.getState().locationSource === "selected" &&
      useLocationStore.getState().coords != null &&
      Boolean(useLocationStore.getState().address?.primary) &&
      !isPlaceholder(useLocationStore.getState().address?.primary);

    try {
      if (!preserveSelected) {
        await gpsPromise;
      }
    } finally {
      clearGpsWatchdog();
      startupLaunchLog("GPS_FETCH_DONE", {
        durationMs: Date.now() - gpsT0,
        preserveSelected,
        blocksHome: false,
      });
      startupLaunchLog("FRESH_GPS_ACQUIRE", {
        durationMs: Date.now() - gpsT0,
        preserveSelected,
        blocksHome: false,
      });
      if (hasUsableAddress()) {
        useLocationStore.setState({ detectingTimedOut: false, loading: false });
        logHomeLocationVisible(preserveSelected ? "selected_preserved" : "after_gps");
      } else {
        useLocationStore.setState({ loading: false });
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
          logHomeLocationVisible("after_reconcile");
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
  earlyGpsKicked = false;
  clearGpsWatchdog();
}
