import { haversineMeters } from "@/lib/map-route-utils";
import {
  isCustomerOrderOnTheWayStatus,
  isPersonRideInProgressStatus,
  isRiderAtCustomerStatus,
  isRiderAtStoreStatus,
  normalizeCustomerOrderStatus,
} from "@/lib/customer-order-status-display";

/** Geofence highlight radius when rider reaches store or customer (meters). */
export const FOOD_DELIVERY_GEOFENCE_RADIUS_M = 200;

/** Show the geofence circle when rider is within this distance (meters). */
export const FOOD_DELIVERY_GEOFENCE_PROXIMITY_M = 500;

export type FoodDeliveryMapPhase = "rider_to_pickup" | "rider_to_drop";

function hasRiderMarkedFoodPickup(riderPickedUpAt?: string | null): boolean {
  const t = String(riderPickedUpAt ?? "").trim();
  if (!t) return false;
  return Number.isFinite(Date.parse(t));
}

/** Pre-pickup: rider → store. Post-pickup: rider → customer. */
export function getFoodDeliveryMapPhase(
  status: string,
  options?: { riderReachedPickupAt?: string | null; riderPickedUpAt?: string | null }
): FoodDeliveryMapPhase {
  if (hasRiderMarkedFoodPickup(options?.riderPickedUpAt)) {
    return "rider_to_drop";
  }
  const s = normalizeCustomerOrderStatus(status);
  if (isRiderAtCustomerStatus(s)) return "rider_to_drop";
  // PICKED_UP / OUT_FOR_DELIVERY / ON_THE_WAY → customer leg (hide store, show home).
  if (isCustomerOrderOnTheWayStatus(s)) return "rider_to_drop";
  return "rider_to_pickup";
}

export function shouldHighlightFoodPickupZone(args: {
  status: string;
  riderReachedPickupAt?: string | null;
  riderPickedUpAt?: string | null;
  riderLat?: number | null;
  riderLng?: number | null;
  pickupLat: number;
  pickupLng: number;
}): boolean {
  const s = normalizeCustomerOrderStatus(args.status);
  if (hasRiderMarkedFoodPickup(args.riderPickedUpAt)) return false;
  if (isRiderAtStoreStatus(s) || args.riderReachedPickupAt) return true;
  if (args.riderLat == null || args.riderLng == null) return false;
  if (getFoodDeliveryMapPhase(s, args) !== "rider_to_pickup") return false;
  return (
    haversineMeters(args.riderLat, args.riderLng, args.pickupLat, args.pickupLng) <=
    FOOD_DELIVERY_GEOFENCE_PROXIMITY_M
  );
}

export function shouldHighlightFoodDropZone(args: {
  status: string;
  riderPickedUpAt?: string | null;
  riderLat?: number | null;
  riderLng?: number | null;
  dropLat: number;
  dropLng: number;
}): boolean {
  const s = normalizeCustomerOrderStatus(args.status);
  if (
    !hasRiderMarkedFoodPickup(args.riderPickedUpAt) &&
    !isRiderAtCustomerStatus(s) &&
    !isCustomerOrderOnTheWayStatus(s)
  ) {
    return false;
  }
  if (isRiderAtCustomerStatus(s)) return true;
  if (!isCustomerOrderOnTheWayStatus(s) && !hasRiderMarkedFoodPickup(args.riderPickedUpAt)) {
    return false;
  }
  if (args.riderLat == null || args.riderLng == null) return false;
  return (
    haversineMeters(args.riderLat, args.riderLng, args.dropLat, args.dropLng) <=
    FOOD_DELIVERY_GEOFENCE_PROXIMITY_M
  );
}

/** Person-ride drop geofence when captain is nearing destination. */
export function shouldHighlightRideDropZone(args: {
  status: string;
  riderLat?: number | null;
  riderLng?: number | null;
  dropLat: number;
  dropLng: number;
}): boolean {
  const s = normalizeCustomerOrderStatus(args.status);
  if (!isPersonRideInProgressStatus(s) && !isRiderAtCustomerStatus(s)) return false;
  if (isRiderAtCustomerStatus(s)) return true;
  if (args.riderLat == null || args.riderLng == null) return false;
  return (
    haversineMeters(args.riderLat, args.riderLng, args.dropLat, args.dropLng) <=
    FOOD_DELIVERY_GEOFENCE_PROXIMITY_M
  );
}
