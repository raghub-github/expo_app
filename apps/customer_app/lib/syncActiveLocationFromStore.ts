/**
 * Push live GPS pin coords to server active-location.
 *
 * IMPORTANT: Do NOT clear addressId here. Clearing the bound saved address is only
 * allowed via:
 * - POST /v1/me/active-location/reconcile (retention radius decision)
 * - Explicit "Use current location" / user-driven clear (addressId: null)
 *
 * Background GPS sync used to send addressId: null on every watch tick / cold-start
 * race, which wiped the saved address before reconcile could restore it.
 */

import { addressService } from "@/services/address.service";
import { useLocationStore } from "@/store/locationStore";
import { isActiveLocationReconcileReady } from "@/lib/activeLocationReconcileGate";

export async function syncActiveLocationFromStore(): Promise<void> {
  if (!isActiveLocationReconcileReady()) return;
  const { locationSource, coords, address } = useLocationStore.getState();
  if (locationSource !== "current" || !coords) return;
  try {
    if (__DEV__) {
      console.log("[active-location] gps_sync_coords_only", {
        path: "syncActiveLocationFromStore",
        latitude: coords.latitude,
        longitude: coords.longitude,
        note: "omitting addressId to preserve backend binding",
      });
    }
    await addressService.setActiveLocation({
      latitude: coords.latitude,
      longitude: coords.longitude,
      address: address?.fullAddress ?? address?.primary ?? "Current location",
      // omit addressId — preserve backend-bound saved address if any
    });
  } catch {
    // Non-blocking — discovery already uses store coords.
  }
}
