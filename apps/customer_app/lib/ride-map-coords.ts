import { haversineKm } from "./billSummary";
import type { OrderDetail } from "../services/order.service";
import type { MapLatLng } from "./map-route-utils";

/** Max straight-line distance captain can be from pickup on an active local ride. */
export const MAX_CAPTAIN_PICKUP_DISTANCE_KM = 80;

/**
 * GPS / status / radar must never remount the native map.
 * Encoding `nav` vs `pickup` in the React key recreates Mapbox and flashes the screen.
 */
export function rideTrackingMapInstanceKey(orderId: string | null | undefined): string {
  return String(orderId ?? "").trim();
}

/** Follow camera only after the user taps locate — GPS ticks must not pan/zoom. */
export const RIDE_GPS_AUTO_FOLLOW_DEFAULT = false;

export function isValidMapCoordinate(
  lat: number | null | undefined,
  lng: number | null | undefined
): boolean {
  if (lat == null || lng == null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
  // India service footprint (with small buffer).
  if (lat < 6 || lat > 38 || lng < 68 || lng > 98) return false;
  return true;
}

export function resolveRidePickupPoint(order: OrderDetail): MapLatLng | null {
  if (isValidMapCoordinate(order.pickupLat, order.pickupLng)) {
    return { latitude: order.pickupLat!, longitude: order.pickupLng! };
  }
  return null;
}

export function resolveRideDropPoint(order: OrderDetail): MapLatLng | null {
  if (isValidMapCoordinate(order.deliveryLat, order.deliveryLng)) {
    return { latitude: order.deliveryLat!, longitude: order.deliveryLng! };
  }
  return null;
}

export function distanceKmBetween(a: MapLatLng, b: MapLatLng): number {
  return haversineKm(a.latitude, a.longitude, b.latitude, b.longitude);
}

/** Drop stale / wrong-city GPS — only show captain when plausibly en route to pickup. */
export function sanitizeRiderPositionForPickup(
  rider: MapLatLng | null,
  pickup: MapLatLng | null,
  maxKm = MAX_CAPTAIN_PICKUP_DISTANCE_KM
): MapLatLng | null {
  if (!rider || !pickup) return rider;
  if (!isValidMapCoordinate(rider.latitude, rider.longitude)) return null;
  const km = distanceKmBetween(rider, pickup);
  if (!Number.isFinite(km) || km > maxKm) return null;
  return rider;
}
