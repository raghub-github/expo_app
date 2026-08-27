/**
 * Ask the backend whether the bound saved address is still valid vs live GPS,
 * then apply the single active delivery pin to the local location store.
 *
 * Backend is the single source of truth for cold start / force-close.
 * In-session remote selections ("order for someone else") survive resume:
 * if reconcile returns switched_far but sessionSelectionKind === "remote",
 * we re-bind the saved address instead of wiping the checkout pin.
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
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import { applyActiveLocationFromBackend } from "@/lib/applyActiveLocationFromBackend";
import { promptCartIfLocationBrokeServiceability } from "@/lib/promptCartIfLocationBrokeServiceability";

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

  // Instant paint: if nothing is shown yet (no cache / no backend pin — e.g. a signed-in
  // first launch), grab a FAST fix and display it immediately while the accurate fix below
  // resolves. Fire-and-forget; the accurate reconcile decision still owns serviceability.
  if (
    useLocationStore.getState().coords == null &&
    useLocationStore.getState().locationSource !== "selected"
  ) {
    void getFastPosition({})
      .then((f) => {
        const s = useLocationStore.getState();
        if (s.coords == null && s.locationSource !== "selected") {
          void applyCurrentGpsPin({ latitude: f.latitude, longitude: f.longitude });
        }
      })
      .catch(() => {});
  }

  let gps: { latitude: number; longitude: number };
  // Device time of the fix (§30): lets the backend reject an out-of-order/stale fix
  // overwriting a newer one. Only set for a genuinely fresh fix — a cached fallback
  // has no reliable capture time, so we omit it (backend falls back to last-write-wins).
  let capturedAtMs: number | undefined;
  try {
    const fix = await getBestEffortPosition({});
    gps = { latitude: fix.latitude, longitude: fix.longitude };
    capturedAtMs = Date.now();
  } catch {
    const fallback = useLocationStore.getState().coords;
    if (!fallback) {
      await applyActiveLocationFromBackend(queryClient);
      return null;
    }
    gps = fallback;
  }

  const prior = useLocationStore.getState();
  const priorKind = prior.sessionSelectionKind;
  const priorBoundId = prior.sessionBoundAddressId;

  const addressLabel =
    prior.address?.fullAddress ?? prior.address?.primary ?? null;

  if (__DEV__) {
    console.log("[active-location] reconcile_request", {
      path: "reconcileActiveLocationFromGps",
      gpsLatitude: gps.latitude,
      gpsLongitude: gps.longitude,
      localLocationSource: prior.locationSource,
      sessionSelectionKind: priorKind,
      sessionBoundAddressId: priorBoundId,
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
      });
    }

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
      if (result.switchedToCurrent || result.source === "selected") {
        void invalidateFoodHomeLocationQueries(queryClient);
        void promptCartIfLocationBrokeServiceability(queryClient);
      }
    }

    return result;
  } catch (err) {
    if (__DEV__) {
      console.warn("[active-location] reconcile_failed", {
        path: "reconcileActiveLocationFromGps",
        err: err instanceof Error ? err.message : String(err),
      });
    }
    await applyActiveLocationFromBackend(queryClient);
    return null;
  }
}
