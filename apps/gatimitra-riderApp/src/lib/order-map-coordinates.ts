/** Valid map pins from rider order pickup/delivery (orders_core). */

import { distanceMeters } from "@/src/lib/geo-distance";

export type MapPin = { lat: number; lng: number; address?: string };

/** India service bbox — used to detect swapped lat/lng from orders_core. */
const INDIA_LAT_MIN = 6;
const INDIA_LAT_MAX = 37;
const INDIA_LNG_MIN = 68;
const INDIA_LNG_MAX = 98;

function inIndiaBbox(lat: number, lng: number): boolean {
  return (
    lat >= INDIA_LAT_MIN &&
    lat <= INDIA_LAT_MAX &&
    lng >= INDIA_LNG_MIN &&
    lng <= INDIA_LNG_MAX
  );
}

/** Fix common lat/lng swap mistakes before rendering navigation map pins. */
export function normalizeMapPin(
  lat: number,
  lng: number,
  addressHint?: string | null
): { lat: number; lng: number } {
  if (!isValidMapPin(lat, lng)) return { lat, lng };

  // Typical India swap: lat holds longitude (~68–98) and lng holds latitude (~6–37).
  if (
    lat >= INDIA_LNG_MIN &&
    lat <= INDIA_LNG_MAX &&
    lng >= INDIA_LAT_MIN &&
    lng <= INDIA_LAT_MAX
  ) {
    return { lat: lng, lng: lat };
  }

  const hint = addressHint?.trim() ?? "";
  if (hint && /\bindia\b/i.test(hint)) {
    if (!inIndiaBbox(lat, lng) && inIndiaBbox(lng, lat)) {
      return { lat: lng, lng: lat };
    }
  }

  return { lat, lng };
}

function pinFromCoords(
  lat: unknown,
  lng: unknown,
  address?: string,
  geocoded?: string | null
): MapPin | null {
  const latN = finiteCoord(lat);
  const lngN = finiteCoord(lng);
  if (latN != null && lngN != null && isValidMapPin(latN, lngN)) {
    const normalized = normalizeMapPin(latN, lngN, address);
    return { lat: normalized.lat, lng: normalized.lng, address };
  }
  const geo = parseGeocodedLatLng(geocoded);
  if (geo) {
    const normalized = normalizeMapPin(geo.lat, geo.lng, address);
    return { lat: normalized.lat, lng: normalized.lng, address };
  }
  return null;
}

function finiteCoord(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function isValidMapPin(lat: unknown, lng: unknown): boolean {
  const latN = finiteCoord(lat);
  const lngN = finiteCoord(lng);
  if (latN == null || lngN == null) return false;
  if (Math.abs(latN) < 1e-5 && Math.abs(lngN) < 1e-5) return false;
  if (Math.abs(latN) > 90 || Math.abs(lngN) > 180) return false;
  return true;
}

export function parseGeocodedLatLng(
  raw: string | null | undefined
): { lat: number; lng: number } | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const lat = finiteCoord(parsed.lat ?? parsed.latitude);
    const lng = finiteCoord(parsed.lng ?? parsed.lon ?? parsed.longitude);
    if (lat != null && lng != null && isValidMapPin(lat, lng)) return { lat, lng };
  } catch {
    // fall through
  }
  const comma = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (comma) {
    const lat = Number(comma[1]);
    const lng = Number(comma[2]);
    if (isValidMapPin(lat, lng)) return { lat, lng };
  }
  return null;
}

type OrderCoordsSource = {
  pickup?: { lat?: number; lng?: number; address?: string };
  delivery?: { lat?: number; lng?: number; address?: string };
  dropAddressGeocoded?: string | null;
  pickupAddressGeocoded?: string | null;
};

/** Person ride / parcel: rider pickup stop (passenger pickup). */
export function resolveRidePickupPin(order: OrderCoordsSource | null | undefined): MapPin | null {
  if (!order?.pickup) return null;
  return pinFromCoords(
    order.pickup.lat,
    order.pickup.lng,
    order.pickup.address,
    order.pickupAddressGeocoded
  );
}

export function resolveRestaurantPickupPin(order: OrderCoordsSource | null | undefined): MapPin | null {
  if (!order?.pickup) return null;
  return pinFromCoords(
    order.pickup.lat,
    order.pickup.lng,
    order.pickup.address,
    order.pickupAddressGeocoded
  );
}

export function resolveCustomerDropPin(order: OrderCoordsSource | null | undefined): MapPin | null {
  if (!order?.delivery) return null;
  return pinFromCoords(
    order.delivery.lat,
    order.delivery.lng,
    order.delivery.address,
    order.dropAddressGeocoded
  );
}

/** Skip implausible rider GPS when it is far from the active navigation destination. */
export function isRiderGpsPlausibleForDestination(
  rider: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  maxKm = 80
): boolean {
  if (!isValidMapPin(rider.lat, rider.lng) || !isValidMapPin(destination.lat, destination.lng)) {
    return false;
  }
  return distanceMeters(rider.lat, rider.lng, destination.lat, destination.lng) <= maxKm * 1000;
}
