/**
 * Persist a saved address as the active delivery pin (checkout + home discovery).
 * Marks selection as nearby vs remote so resume can preserve "order for someone else"
 * without undoing genuine travel-away switches for local addresses.
 */

import type { QueryClient } from "@tanstack/react-query";
import { addressService, type Address } from "@/services/address.service";
import { useLocationStore, type SessionSelectionKind } from "@/store/locationStore";
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";
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

  await Promise.all([
    addressService.setActiveLocation({
      latitude: addr.latitude,
      longitude: addr.longitude,
      address: addr.fullAddress,
      addressId: addr.id,
    }),
    // Default flag is separate from MRU (last_used); keep for legacy checkout defaults.
    addressService.setAddressDefault(addr.id).catch(() => {}),
  ]);

  const primary = addr.label ?? "Other";
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

  if (__DEV__) {
    console.log("[active-location] select_saved", {
      path: "applySelectedDeliveryAddress",
      addressId: addr.id,
      selectionKind,
      retentionRadiusM,
    });
  }

  // Force network refetch so the list reflects backend MRU order immediately.
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ["addresses"] }),
    queryClient.refetchQueries({ queryKey: ["active-location"] }),
  ]);
  void invalidateFoodHomeLocationQueries(queryClient);

  const { promptCartIfLocationBrokeServiceability } = await import(
    "@/lib/promptCartIfLocationBrokeServiceability"
  );
  void promptCartIfLocationBrokeServiceability(queryClient);
}
