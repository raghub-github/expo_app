/**
 * Ask the backend whether the bound saved address is still valid vs live GPS,
 * then apply the single active delivery pin to the local location store.
 *
 * Backend is the single source of truth for cold start / force-close.
 * In-session remote selections ("order for someone else") survive resume:
 * if reconcile returns switched_far but sessionSelectionKind === "remote",
 * we re-bind the saved address instead of wiping the checkout pin.
 *
 * Reconcile against where the user is NOW, not where the cache says they were: a stale
 * coordinate near a saved address would keep that address bound after the user had left.
 * So the critical path waits briefly for a live fix, shared with the store's one GPS
 * session, and the session's final fix can still correct the decision afterwards.
 *
 * The opposite mistake matters as much: the backend clears a binding for good when told
 * the user is far away, so a rough cell-tower fix must not get to say that.
 */

import type { QueryClient } from "@tanstack/react-query";
import { getDeviceLocationReadiness } from "@gatimitra/expo-location-kit";
import { addressService, type ReconcileActiveLocationResult } from "@/services/address.service";
import { useAuthStore } from "@/store/authStore";
import {
  awaitFinalDeviceFix,
  awaitTrustedDeviceFix,
  distanceFromAddressAnchorM,
  fixIsConclusive,
  isPlaceholderAddress,
  resolveDeviceAddress,
  useLocationStore,
} from "@/store/locationStore";
import {
  debouncedInvalidateFoodHomeListingQueries,
  invalidateFoodHomeLocationQueries,
} from "@/lib/invalidateFoodHomeLocationQueries";
import { applyActiveLocationFromBackend } from "@/lib/applyActiveLocationFromBackend";
import { promptCartIfLocationBrokeServiceability } from "@/lib/promptCartIfLocationBrokeServiceability";
import { metresBetween } from "@/lib/locationFixSelection";
import { classifyFreshness } from "@/lib/lastKnownLocationCache";

/** Background accurate refine: skip POST if GPS moved less than this vs the fast pin. */
const ACCURATE_REFINE_MIN_MOVE_M = 40;
/** The reconcile gate waits this long for a live fix before falling back to the cached pin. */
const RECONCILE_LIVE_FIX_WAIT_MS = 2_000;
/** The visible label still describes a pin this close to where it was resolved. */
const LABEL_VALID_M = 60;

function applyCurrentGpsPin(gps: { latitude: number; longitude: number }): void {
  // Coord-first: paint immediately. Reverse-geocode must not block Enable / home header.
  const store = useLocationStore.getState();
  const existing = store.address;
  // A saved-address label ("Home") never describes a GPS pin, even a nearby one.
  const hasRealLabel =
    store.locationSource === "current" &&
    !!existing &&
    !((existing.primary ?? "").trim().toLowerCase() === "current location" &&
      !existing.city &&
      !existing.state &&
      !existing.pincode);

  if (hasRealLabel && distanceFromAddressAnchorM(gps) < LABEL_VALID_M) {
    const sameSpot =
      store.coords != null &&
      Math.abs(store.coords.latitude - gps.latitude) < 1e-4 &&
      Math.abs(store.coords.longitude - gps.longitude) < 1e-4;
    if (!sameSpot) store.setAddressAndCoords(existing!, gps, { source: "current" });
    useLocationStore.setState({ loading: false, refining: false });
    return;
  }

  store.setAddressAndCoords(
    hasRealLabel
      ? existing!
      : { primary: "Current location", secondary: "", fullAddress: "Current location" },
    gps,
    { source: "current" }
  );
  useLocationStore.setState({ refining: true, loading: false });
  resolveDeviceAddress(gps);
}

async function restoreRemoteSelection(
  addressId: number,
  queryClient?: QueryClient
): Promise<boolean> {
  try {
    const addresses = queryClient
      ? await queryClient.fetchQuery({
          queryKey: ["addresses"],
          queryFn: () => addressService.getAddresses(),
          staleTime: 30_000,
        })
      : await addressService.getAddresses();
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
      queryClient.setQueryData(["addresses"], addresses);
      await queryClient.invalidateQueries({ queryKey: ["active-location"] });
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
  options?: {
    allowRemoteSessionPreserve?: boolean;
    /** `gps` is a fallback for the decision only: do not move a live pin back onto it. */
    gpsIsCachedFallback?: boolean;
  }
): Promise<ReconcileActiveLocationResult> {
  const prior = useLocationStore.getState();
  const priorKind = prior.sessionSelectionKind;
  const priorBoundId = prior.sessionBoundAddressId;
  const priorPin = {
    lat: prior.coords?.latitude ?? null,
    lng: prior.coords?.longitude ?? null,
    pincode: prior.address?.pincode?.trim() || null,
    boundAddressId: prior.sessionBoundAddressId,
    source: prior.locationSource,
  };

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
  } else if (!options?.gpsIsCachedFallback || prior.locationSource !== "current" || !prior.coords) {
    applyCurrentGpsPin(gps);
  }

  if (queryClient) {
    const next = useLocationStore.getState();
    const pinUnchanged =
      priorPin.lat != null &&
      next.coords != null &&
      Math.abs(priorPin.lat - next.coords.latitude) < 1e-5 &&
      Math.abs((priorPin.lng ?? 0) - next.coords.longitude) < 1e-5 &&
      priorPin.pincode === (next.address?.pincode?.trim() || null) &&
      priorPin.boundAddressId === next.sessionBoundAddressId &&
      priorPin.source === next.locationSource;

    // Same delivery pin — don't refetch geo/offers/merchants/addresses again.
    if (!pinUnchanged) {
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
  }

  return result;
}

/**
 * Once the GPS session ends, re-check the decision if its final fix landed somewhere
 * materially different from the fix the decision was based on. This also runs when the
 * decision kept a saved address: that is exactly the case where a poor first fix can have
 * been wrong. It stands down only if the USER has picked a pin in the meantime.
 */
function scheduleAccurateReconcileRefine(
  decidedAt: { latitude: number; longitude: number },
  decidedAtMs: number,
  appliedCoords: { latitude: number; longitude: number } | null,
  queryClient: QueryClient | undefined,
  options?: { allowRemoteSessionPreserve?: boolean }
): void {
  void (async () => {
    try {
      const next = await awaitFinalDeviceFix();
      // Not newer than what was decided on (the fix-was-fresh path starts no session).
      if (!next || next.timestampMs <= decidedAtMs) return;

      const userPickedPin = () => {
        const s = useLocationStore.getState();
        return s.locationSource === "selected" && s.coords !== appliedCoords;
      };
      if (userPickedPin()) return;

      // A coarse final fix has to move further than its own error before it means anything.
      const moved =
        metresBetween(decidedAt.latitude, decidedAt.longitude, next.latitude, next.longitude) >=
        Math.max(ACCURATE_REFINE_MIN_MOVE_M, next.accuracy ?? 0);
      if (!moved) {
        if (__DEV__) {
          console.log("[active-location] accurate_refine_skip", {
            path: "reconcileActiveLocationFromGps",
            reason: "no_meaningful_change",
          });
        }
        return;
      }

      const store = useLocationStore.getState();
      const addressLabel =
        store.locationSource === "selected" || isPlaceholderAddress(store.address)
          ? null
          : (store.address?.fullAddress ?? store.address?.primary ?? null);
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
      if (userPickedPin()) return;

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

  // Captured first: the GPS session may replace the store's coords while we wait.
  const reference = useLocationStore.getState().coords;
  const live = await awaitTrustedDeviceFix(RECONCILE_LIVE_FIX_WAIT_MS);
  if (live && (!reference || fixIsConclusive(live, reference))) {
    gps = { latitude: live.latitude, longitude: live.longitude };
    capturedAtMs = live.timestampMs;
  } else {
    // No believable fix in time. The cached pin keeps the gate moving; the final fix corrects it.
    if (!reference) {
      await applyActiveLocationFromBackend(queryClient);
      return null;
    }
    gps = reference;
    usedCachedStoreCoords = true;
  }

  const prior = useLocationStore.getState();
  const addressLabel = isPlaceholderAddress(prior.address)
    ? null
    : (prior.address?.fullAddress ?? prior.address?.primary ?? null);

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

    const applied = await applyReconcileResult(result, gps, queryClient, {
      ...options,
      gpsIsCachedFallback: usedCachedStoreCoords,
    });

    // Accurate GPS refine after gate can open — do not await.
    scheduleAccurateReconcileRefine(gps, capturedAtMs ?? 0, useLocationStore.getState().coords, queryClient, options);

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
    scheduleAccurateReconcileRefine(gps, capturedAtMs ?? 0, useLocationStore.getState().coords, queryClient, options);
    return null;
  }
}
