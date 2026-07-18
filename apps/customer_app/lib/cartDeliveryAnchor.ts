import { haversineKm } from "@/lib/billSummary";
import { useLocationStore, type LocationSource } from "@/store/locationStore";

export type CartDeliveryAnchor = {
  latitude: number;
  longitude: number;
  locationSource: LocationSource | null;
};

/** Cart built in a different city/area — not the 250m address-snap radius. */
export const CART_DELIVERY_ANCHOR_MAX_KM = 15;

export function readCurrentDeliveryAnchor(): CartDeliveryAnchor | null {
  const { coords, locationSource } = useLocationStore.getState();
  if (!coords) return null;
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    locationSource,
  };
}

export function isCartDeliveryAnchorMismatch(
  anchor: CartDeliveryAnchor | null | undefined
): boolean {
  if (!anchor) return false;
  const current = readCurrentDeliveryAnchor();
  if (!current) return false;
  const km = haversineKm(
    anchor.latitude,
    anchor.longitude,
    current.latitude,
    current.longitude
  );
  return km > CART_DELIVERY_ANCHOR_MAX_KM;
}

export function captureCartDeliveryAnchor(): CartDeliveryAnchor | null {
  return readCurrentDeliveryAnchor();
}
