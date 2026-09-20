import { Alert } from "react-native";
import type { Router } from "expo-router";
import { useLocationStore } from "@/store/locationStore";
import { useCheckoutSheetStore } from "@/store/checkoutSheetStore";
import { useCartCheckoutGateStore } from "@/store/cartCheckoutGateStore";

export type OpenCheckoutAddAddressOptions = {
  router: Router;
  /** Close the inner "Select an address" sheet before navigating. */
  closeAddressSheet?: () => void;
  /**
   * When checkout is the root drawer, hide it without the meals-under-price
   * cart-clearing close path.
   */
  hideCheckoutDrawer?: boolean;
  /** When opened from CartCheckoutGateHost, hide the entire gate overlay. */
  hideCartGate?: boolean;
};

/** Prevents multi-tap → stacked /location-address entries. */
let addAddressNavLock = false;
let addAddressNavUnlockTimer: ReturnType<typeof setTimeout> | null = null;

function lockAddAddressNav(): boolean {
  if (addAddressNavLock) return false;
  addAddressNavLock = true;
  if (addAddressNavUnlockTimer) clearTimeout(addAddressNavUnlockTimer);
  // Safety unlock if navigation never settles (permission denied path clears sooner).
  addAddressNavUnlockTimer = setTimeout(() => {
    addAddressNavLock = false;
    addAddressNavUnlockTimer = null;
  }, 2500);
  return true;
}

function unlockAddAddressNav(): void {
  addAddressNavLock = false;
  if (addAddressNavUnlockTimer) {
    clearTimeout(addAddressNavUnlockTimer);
    addAddressNavUnlockTimer = null;
  }
}

/**
 * Opens the Add Address form directly (GPS-prefilled), skipping the global
 * /location picker. Shared by checkout modal + CheckoutAddressSelectSheet.
 */
export async function openCheckoutAddAddress(
  options: OpenCheckoutAddAddressOptions
): Promise<void> {
  if (!lockAddAddressNav()) return;

  const {
    router,
    closeAddressSheet,
    hideCheckoutDrawer = true,
    hideCartGate = true,
  } = options;

  closeAddressSheet?.();

  if (hideCartGate) {
    useCartCheckoutGateStore.getState().hide();
  }
  if (hideCheckoutDrawer) {
    // Hide only — do not call CheckoutBottomSheetHost onSheetClose (can clear cart).
    useCheckoutSheetStore.getState().hide();
  }

  try {
    await useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
    const { permissionStatus, coords, address } = useLocationStore.getState();
    if (permissionStatus !== "granted" || !coords) {
      unlockAddAddressNav();
      Alert.alert(
        "Location required",
        "Please enable location to add your delivery address."
      );
      return;
    }

    router.push({
      pathname: "/location-address",
      params: {
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
        primary: address?.primary ?? "Current location",
        fullAddress: address?.fullAddress ?? "",
        afterSaveReturn: "checkout",
      },
    });
  } catch {
    unlockAddAddressNav();
  }
}
