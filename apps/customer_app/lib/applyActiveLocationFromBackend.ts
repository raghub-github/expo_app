/**
 * Apply backend GET /active-location (+ addresses list) when GPS reconcile cannot run
 * (permission denied / services off). Keeps Saved Address SoT without inventing Current.
 */

import type { QueryClient } from "@tanstack/react-query";
import { addressService } from "@/services/address.service";
import { useLocationStore } from "@/store/locationStore";
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import { promptCartIfLocationBrokeServiceability } from "@/lib/promptCartIfLocationBrokeServiceability";
import { haversineKm } from "@/lib/billSummary";
import type { SessionSelectionKind } from "@/store/locationStore";

const DEFAULT_RETENTION_M = 500;

function classifyKind(
  gps: { latitude: number; longitude: number } | null,
  saved: { latitude: number; longitude: number },
  retentionRadiusM: number
): SessionSelectionKind {
  if (!gps) return "remote";
  const meters = haversineKm(gps.latitude, gps.longitude, saved.latitude, saved.longitude) * 1000;
  return meters <= retentionRadiusM ? "nearby" : "remote";
}

export async function applyActiveLocationFromBackend(
  queryClient?: QueryClient,
  options?: { retentionRadiusM?: number }
): Promise<boolean> {
  try {
    const [active, addresses] = await Promise.all([
      addressService.getActiveLocation(),
      addressService.getAddresses().catch(() => [] as Awaited<ReturnType<typeof addressService.getAddresses>>),
    ]);

    if (queryClient) {
      queryClient.setQueryData(["active-location"], active);
      if (addresses.length > 0) {
        queryClient.setQueryData(["addresses"], addresses);
      }
    }

    const retentionRadiusM = options?.retentionRadiusM ?? DEFAULT_RETENTION_M;
    const gps = useLocationStore.getState().coords;
    const boundId = active.addressId ?? null;
    if (boundId != null) {
      const saved = addresses.find((a) => a.id === boundId);
      if (saved) {
        const selectionKind = classifyKind(
          gps,
          { latitude: saved.latitude, longitude: saved.longitude },
          retentionRadiusM
        );
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
          { source: "selected", selectionKind, boundAddressId: boundId }
        );
        if (queryClient) {
          void invalidateFoodHomeLocationQueries(queryClient);
          void promptCartIfLocationBrokeServiceability(queryClient);
        }
        if (__DEV__) {
          console.log("[active-location] apply_backend_bound", {
            path: "applyActiveLocationFromBackend",
            addressId: boundId,
            source: "selected",
            selectionKind,
          });
        }
        return true;
      }
    }

    if (active.latitude != null && active.longitude != null) {
      const label = active.address?.trim() || "Current location";
      useLocationStore.getState().setAddressAndCoords(
        {
          primary: label.slice(0, 48),
          secondary: "",
          fullAddress: label,
        },
        { latitude: active.latitude, longitude: active.longitude },
        { source: "current" }
      );
      if (queryClient) {
        void invalidateFoodHomeLocationQueries(queryClient);
        void promptCartIfLocationBrokeServiceability(queryClient);
      }
      if (__DEV__) {
        console.log("[active-location] apply_backend_pin", {
          path: "applyActiveLocationFromBackend",
          addressId: null,
          source: "current",
        });
      }
      return true;
    }

    return false;
  } catch (err) {
    if (__DEV__) {
      console.warn("[active-location] apply_backend_failed", {
        err: err instanceof Error ? err.message : String(err),
      });
    }
    return false;
  }
}
