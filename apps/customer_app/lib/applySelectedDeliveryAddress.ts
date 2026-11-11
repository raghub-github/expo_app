/**
 * Persist a saved address as the active delivery pin (checkout + home discovery).
 * Marks selection as nearby vs remote so resume can preserve "order for someone else"
 * without undoing genuine travel-away switches for local addresses.
 *
 * Instant UX: paint the pin in the location store first, then sync backend in background.
 */

import type { QueryClient } from "@tanstack/react-query";
import { addressService, type Address } from "@/services/address.service";
import { useLocationStore, type SessionSelectionKind } from "@/store/locationStore";
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";
import { mergeAddressesIntoQuery } from "@/lib/addressesCache";
import { haversineKm } from "@/lib/billSummary";

const DEFAULT_RETENTION_M = 500;

function classifySelectionKind(
  addr: Address,
  retentionRadiusM: number
): SessionSelectionKind {
  const gps = useLocationStore.getState().coords;
  if (!gps) return "remote";
  const meters = haversineKm(gps.latitude, gps.longitude, addr.latitude, addr.longitude) * 1000;
  return meters <= retentionRadiusM ? "nearby" : "remote";
}

/** Persist a saved address as the active delivery pin (checkout + home discovery). */
export async function applySelectedDeliveryAddress(
  addr: Address,
  queryClient: QueryClient,
  options?: { retentionRadiusM?: number }
): Promise<void> {
  const retentionRadiusM = options?.retentionRadiusM ?? DEFAULT_RETENTION_M;
  const selectionKind = classifySelectionKind(addr, retentionRadiusM);

  const primary = addr.label ?? "Other";
  // 1) Instant UI — never wait on network before the pin updates.
  useLocationStore.getState().setAddressAndCoords(
    {
      primary,
      secondary: addr.fullAddress.slice(0, 80),
      fullAddress: addr.fullAddress,
      city: addr.city ?? null,
      state: addr.state ?? null,
      pincode: addr.pincode ?? null,
    },
    { latitude: addr.latitude, longitude: addr.longitude },
    { source: "selected", selectionKind, boundAddressId: addr.id }
  );
  // Keep Select-location list warm offline even if the list API is slow.
  mergeAddressesIntoQuery(queryClient, { ...addr, isSelected: true, isLastUsed: true });
  void invalidateFoodHomeLocationQueries(queryClient);

  if (__DEV__) {
    console.log("[active-location] select_saved", {
      path: "applySelectedDeliveryAddress",
      addressId: addr.id,
      selectionKind,
      retentionRadiusM,
      instant: true,
    });
  }

  // 2) Background persist + list refresh — failures must not undo the local pin.
  void (async () => {
    try {
      await Promise.all([
        addressService.setActiveLocation({
          latitude: addr.latitude,
          longitude: addr.longitude,
          address: addr.fullAddress,
          addressId: addr.id,
        }),
        addressService.setAddressDefault(addr.id).catch(() => {}),
      ]);
      void queryClient.invalidateQueries({ queryKey: ["addresses"] });
      void queryClient.invalidateQueries({ queryKey: ["active-location"] });
    } catch (e) {
      if (__DEV__) {
        console.warn("[active-location] select_saved_sync_failed", e);
      }
    }
  })();

  void import("@/lib/promptCartIfLocationBrokeServiceability").then(({ promptCartIfLocationBrokeServiceability }) => {
    void promptCartIfLocationBrokeServiceability(queryClient);
  });
}
