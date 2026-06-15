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

/** Pre-pickup: rider → store. Post-pickup: rider → customer. */
export function getFoodDeliveryMapPhase(
  status: string,
  _riderReachedPickupAt?: string | null
): FoodDeliveryMapPhase {
  const s = normalizeCustomerOrderStatus(status);
  if (isCustomerOrderOnTheWayStatus(s) || isRiderAtCustomerStatus(s)) {
    return "rider_to_drop";
  }
  return "rider_to_pickup";
}

export function shouldHighlightFoodPickupZone(args: {
  status: string;
  riderReachedPickupAt?: string | null;
  riderLat?: number | null;
  riderLng?: number | null;
  pickupLat: number;
  pickupLng: number;
}): boolean {
  const s = normalizeCustomerOrderStatus(args.status);
  if (isRiderAtStoreStatus(s) || args.riderReachedPickupAt) return true;
  if (args.riderLat == null || args.riderLng == null) return false;
  if (getFoodDeliveryMapPhase(s, args.riderReachedPickupAt) !== "rider_to_pickup") return false;
  return (
    haversineMeters(args.riderLat, args.riderLng, args.pickupLat, args.pickupLng) <=
    FOOD_DELIVERY_GEOFENCE_PROXIMITY_M
  );
}

export function shouldHighlightFoodDropZone(args: {
  status: string;
  riderLat?: number | null;
  riderLng?: number | null;
  dropLat: number;
  dropLng: number;
}): boolean {
  const s = normalizeCustomerOrderStatus(args.status);
  if (isRiderAtCustomerStatus(s)) return true;
  if (!isCustomerOrderOnTheWayStatus(s)) return false;
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
