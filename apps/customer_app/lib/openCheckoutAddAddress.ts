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

/**
 * Opens the Add Address form directly (GPS-prefilled), skipping the global
 * /location picker. Shared by checkout modal + CheckoutAddressSelectSheet.
 */
export async function openCheckoutAddAddress(
  options: OpenCheckoutAddAddressOptions
): Promise<void> {
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

  await useLocationStore.getState().requestPermissionAndFetch({ forceDevice: true });
  const { permissionStatus, coords, address } = useLocationStore.getState();
  if (permissionStatus !== "granted" || !coords) {
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
}
