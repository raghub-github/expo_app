/** Valid map pins from rider order pickup/delivery (orders_core). */

export type MapPin = { lat: number; lng: number; address?: string };

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
  const lat = order.pickup.lat;
  const lng = order.pickup.lng;
  if (isValidMapPin(lat, lng)) {
    return { lat: lat!, lng: lng!, address: order.pickup.address };
  }
  const geo = parseGeocodedLatLng(order.pickupAddressGeocoded);
  if (geo) {
    return { lat: geo.lat, lng: geo.lng, address: order.pickup.address };
  }
  return null;
}

export function resolveRestaurantPickupPin(order: OrderCoordsSource | null | undefined): MapPin | null {
  if (!order?.pickup) return null;
  const lat = order.pickup.lat;
  const lng = order.pickup.lng;
  if (isValidMapPin(lat, lng)) {
    return { lat: lat!, lng: lng!, address: order.pickup.address };
  }
  const geo = parseGeocodedLatLng(order.pickupAddressGeocoded);
  if (geo) {
    return { lat: geo.lat, lng: geo.lng, address: order.pickup.address };
  }
  return null;
}

export function resolveCustomerDropPin(order: OrderCoordsSource | null | undefined): MapPin | null {
  if (!order?.delivery) return null;
  const lat = order.delivery.lat;
  const lng = order.delivery.lng;
  if (isValidMapPin(lat, lng)) {
    return { lat: lat!, lng: lng!, address: order.delivery.address };
  }
  const geo = parseGeocodedLatLng(order.dropAddressGeocoded);
  if (geo) {
    return { lat: geo.lat, lng: geo.lng, address: order.delivery.address };
  }
  return null;
}
