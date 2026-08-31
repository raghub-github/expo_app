/**
 * Ask the backend whether the bound saved address is still valid vs live GPS,
 * then apply the single active delivery pin to the local location store.
 *
 * Backend is the single source of truth for cold start / force-close.
 * In-session remote selections ("order for someone else") survive resume:
 * if reconcile returns switched_far but sessionSelectionKind === "remote",
 * we re-bind the saved address instead of wiping the checkout pin.
 *
 * Critical path uses a FAST fix so the home reconcile gate opens quickly and
 * service tiles can filter. Accurate GPS refine runs in the background.
 */

import type { QueryClient } from "@tanstack/react-query";
import {
  getBestEffortPosition,
  getFastPosition,
  getDeviceLocationReadiness,
} from "@gatimitra/expo-location-kit";
import { addressService, type ReconcileActiveLocationResult } from "@/services/address.service";
import { reverseGeocode } from "@/services/location.service";
import { useAuthStore } from "@/store/authStore";
import { useLocationStore } from "@/store/locationStore";
import {
  debouncedInvalidateFoodHomeListingQueries,
  invalidateFoodHomeLocationQueries,
} from "@/lib/invalidateFoodHomeLocationQueries";
import { applyActiveLocationFromBackend } from "@/lib/applyActiveLocationFromBackend";
import { promptCartIfLocationBrokeServiceability } from "@/lib/promptCartIfLocationBrokeServiceability";
import { metresBetween, shouldReplaceFix } from "@/lib/locationFixSelection";

/** Background accurate refine: skip POST if GPS moved less than this vs the fast pin. */
const ACCURATE_REFINE_MIN_MOVE_M = 40;

async function applyCurrentGpsPin(gps: { latitude: number; longitude: number }): Promise<void> {
  // Coord-first (section 10): paint the coordinate immediately, then resolve the address
  // asynchronously. Keep any current address we already show as the placeholder to avoid a
  // flash back to the generic "Current location" label.
  const store = useLocationStore.getState();
  const placeholder =
    store.locationSource === "current" && store.address
      ? store.address
      : { primary: "Current location", secondary: "", fullAddress: "Current location" };
  store.setAddressAndCoords(placeholder, gps, { source: "current" });
  try {
    const geo = await reverseGeocode(gps.longitude, gps.latitude);
    if (useLocationStore.getState().locationSource !== "current") return;
    useLocationStore.getState().setAddressAndCoords(geo, gps, { source: "current" });
  } catch {
    // keep the placeholder coordinate label
  }
}

async function restoreRemoteSelection(
  addressId: number,
  queryClient?: QueryClient
): Promise<boolean> {
  try {
    const addresses = await addressService.getAddresses();
    const saved = addresses.find((a) => a.id === addressId);
    if (!saved) return false;
    await addressService.setActiveLocation({
      latitude: saved.latitude,
      longitude: saved.longitude,
      address: saved.fullAddress,
      addressId: saved.id,
    });
    useLocationStore.getState().setAddressAndCoords(
      {
        primary: saved.label ?? "Address",
        secondary: saved.fullAddress.slice(0, 80),
        fullAddress: saved.fullAddress,
        city: saved.city,
        state: saved.state,
        pincode: saved.pincode,
      },
      { latitude: saved.latitude, longitude: saved.longitude },
      { source: "selected", selectionKind: "remote", boundAddressId: saved.id }
    );
    if (queryClient) {
      await queryClient.invalidateQueries({ queryKey: ["active-location"] });
      await queryClient.invalidateQueries({ queryKey: ["addresses"] });
      void invalidateFoodHomeLocationQueries(queryClient);
    }
    if (__DEV__) {
      console.log("[active-location] restore_remote_session", {
        path: "reconcileActiveLocationFromGps",
        addressId,
        reason: "preserve_order_for_someone_else",
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function applyReconcileResult(
  result: ReconcileActiveLocationResult,
  gps: { latitude: number; longitude: number },
  queryClient: QueryClient | undefined,
  options?: { allowRemoteSessionPreserve?: boolean }
): Promise<ReconcileActiveLocationResult> {
  const prior = useLocationStore.getState();
  const priorKind = prior.sessionSelectionKind;
  const priorBoundId = prior.sessionBoundAddressId;

  // Resume / in-session: keep intentional remote Saved Address (order for someone else).
  if (
    options?.allowRemoteSessionPreserve &&
    result.reason === "switched_far" &&
    priorKind === "remote" &&
    priorBoundId != null
  ) {
    const restored = await restoreRemoteSelection(priorBoundId, queryClient);
    if (restored) {
      return {
        ...result,
        addressId: priorBoundId,
        source: "selected",
        switchedToCurrent: false,
        reason: "kept_nearby",
      };
    }
  }

  if (result.source === "selected" && result.savedAddress) {
    const a = result.savedAddress;
    const kind =
      result.distanceM != null && result.distanceM > result.retentionRadiusM
        ? "remote"
        : "nearby";
    useLocationStore.getState().setAddressAndCoords(
      {
        primary: a.label ?? "Address",
        secondary: a.fullAddress.slice(0, 80),
        fullAddress: a.fullAddress,
        city: a.city,
        state: a.state,
        pincode: a.pincode,
      },
      { latitude: a.latitude, longitude: a.longitude },
      { source: "selected", selectionKind: kind, boundAddressId: a.id }
    );
  } else {
    await applyCurrentGpsPin(gps);
  }

  if (queryClient) {
    await queryClient.invalidateQueries({ queryKey: ["active-location"] });
    await queryClient.invalidateQueries({ queryKey: ["addresses"] });
    if (result.switchedToCurrent) {
      debouncedInvalidateFoodHomeListingQueries(queryClient);
    } else if (result.source === "selected") {
      void invalidateFoodHomeLocationQueries(queryClient);
    }
    if (result.switchedToCurrent || result.source === "selected") {
      void promptCartIfLocationBrokeServiceability(queryClient);
    }
  }

  return result;
}

/**
 * Accurate GPS in the background after the fast reconcile opened the gate.
 * Re-POSTs only when the accurate fix meaningfully differs from the fast pin.
 */
function scheduleAccurateReconcileRefine(
  fastGps: { latitude: number; longitude: number },
  queryClient: QueryClient | undefined,
  options?: { allowRemoteSessionPreserve?: boolean }
): void {
  void (async () => {
    try {
      const fix = await getBestEffortPosition({});
      const next = {
        latitude: fix.latitude,
        longitude: fix.longitude,
        accuracy: fix.accuracy ?? null,
        timestampMs: Date.now(),
      };
      const store = useLocationStore.getState();
      // User picked a saved/remote pin while we were refining — do not override.
      if (store.locationSource === "selected") return;

      const current = store.coords
        ? {
            latitude: store.coords.latitude,
            longitude: store.coords.longitude,
            accuracy: store.coordsAccuracy,
            timestampMs: store.coordsUpdatedAt ?? Date.now(),
          }
        : {
            latitude: fastGps.latitude,
            longitude: fastGps.longitude,
            accuracy: null as number | null,
            timestampMs: Date.now(),
          };

      const movedFromFast =
        metresBetween(fastGps.latitude, fastGps.longitude, next.latitude, next.longitude) >=
        ACCURATE_REFINE_MIN_MOVE_M;
      if (!movedFromFast && !shouldReplaceFix(current, next)) {
        if (__DEV__) {
          console.log("[active-location] accurate_refine_skip", {
            path: "reconcileActiveLocationFromGps",
            reason: "no_meaningful_change",
          });
        }
        return;
      }

      const addressLabel =
        store.address?.fullAddress ?? store.address?.primary ?? null;
      const result = await addressService.reconcileActiveLocation({
        latitude: next.latitude,
        longitude: next.longitude,
        address: addressLabel,
        capturedAtMs: next.timestampMs,
      });

      if (__DEV__) {
        console.log("[active-location] accurate_refine_response", {
          path: "reconcileActiveLocationFromGps",
          addressId: result.addressId,
          source: result.source,
          reason: result.reason,
          distanceM: result.distanceM,
        });
      }

      // Bail if user selected a pin during the network round-trip.
      if (useLocationStore.getState().locationSource === "selected") return;

      await applyReconcileResult(result, { latitude: next.latitude, longitude: next.longitude }, queryClient, options);
    } catch (err) {
      if (__DEV__) {
        console.warn("[active-location] accurate_refine_failed", {
          path: "reconcileActiveLocationFromGps",
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  })();
}

export async function reconcileActiveLocationFromGps(
  queryClient?: QueryClient,
  options?: { allowRemoteSessionPreserve?: boolean }
): Promise<ReconcileActiveLocationResult | null> {
  if (!useAuthStore.getState().session) return null;

  const readiness = await getDeviceLocationReadiness();
  if (!readiness.isReady) {
    if (__DEV__) {
      console.log("[active-location] reconcile_skip", {
        path: "reconcileActiveLocationFromGps",
        reason: "device_location_not_ready",
      });
    }
    // Still hydrate from backend SoT when GPS is unavailable.
    await applyActiveLocationFromBackend(queryClient);
    return null;
  }

  let gps: { latitude: number; longitude: number };
  // Device time of the fix (§30): only for a genuinely fresh device fix.
  let capturedAtMs: number | undefined;
  let usedCachedStoreCoords = false;

  const existing = useLocationStore.getState().coords;
  if (existing && useLocationStore.getState().locationSource !== "selected") {
    // Instant: last-known / hydrate already painted — reconcile against it first.
    gps = { latitude: existing.latitude, longitude: existing.longitude };
    usedCachedStoreCoords = true;
  } else {
    try {
      const fix = await getFastPosition({});
      gps = { latitude: fix.latitude, longitude: fix.longitude };
      capturedAtMs = Date.now();
      // Paint immediately so geo/services canQuery before the POST returns.
      if (useLocationStore.getState().locationSource !== "selected") {
        void applyCurrentGpsPin(gps);
      }
    } catch {
      const fallback = useLocationStore.getState().coords;
      if (!fallback) {
        await applyActiveLocationFromBackend(queryClient);
        return null;
      }
      gps = fallback;
      usedCachedStoreCoords = true;
    }
  }

  const prior = useLocationStore.getState();
  const addressLabel =
    prior.address?.fullAddress ?? prior.address?.primary ?? null;

  if (__DEV__) {
    console.log("[active-location] reconcile_request", {
      path: "reconcileActiveLocationFromGps",
      gpsLatitude: gps.latitude,
      gpsLongitude: gps.longitude,
      localLocationSource: prior.locationSource,
      sessionSelectionKind: prior.sessionSelectionKind,
      sessionBoundAddressId: prior.sessionBoundAddressId,
      usedCachedStoreCoords,
      phase: "fast",
    });
  }

  try {
    const result = await addressService.reconcileActiveLocation({
      latitude: gps.latitude,
      longitude: gps.longitude,
      address: addressLabel,
      capturedAtMs,
    });

    if (__DEV__) {
      console.log("[active-location] reconcile_response", {
        path: "reconcileActiveLocationFromGps",
        addressId: result.addressId,
        source: result.source,
        reason: result.reason,
        distanceM: result.distanceM,
        retentionRadiusM: result.retentionRadiusM,
        switchedToCurrent: result.switchedToCurrent,
        savedAddressId: result.savedAddress?.id ?? null,
        savedLat: result.savedAddress?.latitude ?? null,
        savedLng: result.savedAddress?.longitude ?? null,
        gpsLatitude: gps.latitude,
        gpsLongitude: gps.longitude,
        phase: "fast",
      });
    }

    const applied = await applyReconcileResult(result, gps, queryClient, options);

    // Accurate GPS refine after gate can open — do not await.
    scheduleAccurateReconcileRefine(gps, queryClient, options);

    return applied;
  } catch (err) {
    if (__DEV__) {
      console.warn("[active-location] reconcile_failed", {
        path: "reconcileActiveLocationFromGps",
        err: err instanceof Error ? err.message : String(err),
      });
    }
    await applyActiveLocationFromBackend(queryClient);
    // Still try accurate refine so we recover if backend apply left a weak pin.
    scheduleAccurateReconcileRefine(gps, queryClient, options);
    return null;
  }
}
