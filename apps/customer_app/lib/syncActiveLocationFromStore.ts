import { addressService } from "@/services/address.service";
import { useLocationStore } from "@/store/locationStore";

/** Push live GPS pin to server active-location so checkout stays aligned with discovery. */
export async function syncActiveLocationFromStore(): Promise<void> {
  const { locationSource, coords, address } = useLocationStore.getState();
  if (locationSource !== "current" || !coords) return;
  try {
    await addressService.setActiveLocation({
      latitude: coords.latitude,
      longitude: coords.longitude,
      address: address?.fullAddress ?? address?.primary ?? "Current location",
    });
  } catch {
    // Non-blocking — discovery already uses store coords.
  }
}
