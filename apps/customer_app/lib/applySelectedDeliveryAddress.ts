import type { QueryClient } from "@tanstack/react-query";
import { addressService, type Address } from "@/services/address.service";
import { useLocationStore } from "@/store/locationStore";
import { invalidateFoodHomeLocationQueries } from "@/lib/invalidateFoodHomeLocationQueries";

/** Persist a saved address as the active delivery pin (checkout + home discovery). */
export async function applySelectedDeliveryAddress(
  addr: Address,
  queryClient: QueryClient
): Promise<void> {
  await Promise.all([
    addressService.setActiveLocation({
      latitude: addr.latitude,
      longitude: addr.longitude,
      address: addr.fullAddress,
    }),
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
    { source: "selected" }
  );
  await queryClient.invalidateQueries({ queryKey: ["addresses"] });
  await queryClient.invalidateQueries({ queryKey: ["active-location"] });
  void invalidateFoodHomeLocationQueries(queryClient);
}
