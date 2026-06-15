/** Dashboard live map — same geofence rules as customer app food tracking. */

export const FOOD_DELIVERY_GEOFENCE_RADIUS_M = 200;
export const FOOD_DELIVERY_GEOFENCE_PROXIMITY_M = 500;

function norm(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

const DISPATCHED = new Set([
  "OUT_FOR_DELIVERY",
  "DISPATCHED",
  "DESPATCHED",
  "IN_TRANSIT",
  "ON_THE_WAY",
  "PICKED_UP",
]);

const DISPATCH_READY = new Set([
  "READY_FOR_PICKUP",
  "READY",
  "DISPATCH_READY",
  "DISPATCHREADY",
  "DISPATCH_READY_FOR_PICKUP",
]);

const RIDER_AT_STORE = new Set(["RIDER_AT_PICKUP", "REACHED_STORE", "REACHED_MERCHANT"]);

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function isFoodPostPickupPhase(args: {
  pickedUpAt?: string | null;
  dispatchedAt?: string | null;
  riderPickedUpAt?: string | null;
  foodOrderStatus?: string | null;
  coreStatus?: string | null;
  currentStatus?: string | null;
}): boolean {
  if (args.pickedUpAt?.trim()) return true;
  if (args.riderPickedUpAt?.trim()) return true;
  if (args.dispatchedAt?.trim()) return true;

  const food = norm(args.foodOrderStatus);
  if (food && DISPATCHED.has(food)) return true;

  const cur = norm(args.currentStatus);
  if (cur && DISPATCHED.has(cur)) return true;
  if (cur.includes("DISPATCHED") && !cur.includes("DISPATCH_READY")) return true;

  const core = norm(args.coreStatus).toLowerCase();
  if (core === "in_transit" || core === "dispatched") return true;
  if (core === "picked_up" && !DISPATCH_READY.has(cur) && !cur.includes("DISPATCH_READY")) {
    return false;
  }

  return false;
}

export function shouldHighlightPickupZone(args: {
  postPickup: boolean;
  reachedMerchantAt?: string | null;
  foodOrderStatus?: string | null;
  riderLat?: number | null;
  riderLng?: number | null;
  pickupLat: number;
  pickupLng: number;
}): boolean {
  if (args.postPickup) return false;
  const food = norm(args.foodOrderStatus);
  if (RIDER_AT_STORE.has(food) || args.reachedMerchantAt) return true;
  if (args.riderLat == null || args.riderLng == null) return false;
  return (
    haversineMeters(args.riderLat, args.riderLng, args.pickupLat, args.pickupLng) <=
    FOOD_DELIVERY_GEOFENCE_PROXIMITY_M
  );
}

export function shouldHighlightDropZone(args: {
  postPickup: boolean;
  foodOrderStatus?: string | null;
  currentStatus?: string | null;
  riderLat?: number | null;
  riderLng?: number | null;
  dropLat: number;
  dropLng: number;
}): boolean {
  if (!args.postPickup) return false;
  const cur = norm(args.currentStatus);
  const food = norm(args.foodOrderStatus);
  if (cur.includes("REACHED") && cur.includes("CUSTOMER")) return true;
  if (food.includes("REACHED") && food.includes("CUSTOMER")) return true;
  if (args.riderLat == null || args.riderLng == null) return false;
  return (
    haversineMeters(args.riderLat, args.riderLng, args.dropLat, args.dropLng) <=
    FOOD_DELIVERY_GEOFENCE_PROXIMITY_M
  );
}

/** GeoJSON polygon approximating a circle (meters). */
export function circlePolygonGeoJson(
  centerLng: number,
  centerLat: number,
  radiusM: number,
  steps = 64
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: [number, number][] = [];
  const latRad = (centerLat * Math.PI) / 180;
  const mPerDegLat = 110540;
  const mPerDegLng = 111320 * Math.cos(latRad);
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * 2 * Math.PI;
    coords.push([
      centerLng + (radiusM / mPerDegLng) * Math.cos(angle),
      centerLat + (radiusM / mPerDegLat) * Math.sin(angle),
    ]);
  }
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}
