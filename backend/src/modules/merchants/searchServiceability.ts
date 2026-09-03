/**
 * Haversine delivery-radius gate for catalog search (no Mapbox Matrix).
 * Mirrors `effectiveServiceRadiusKm` in merchant.service (kept local to avoid cycles).
 */

import { haversineDistanceKm } from "../distance/distance.service.js";

export type StoreGeoRow = {
  id: number;
  latitude: number | string | null | undefined;
  longitude: number | string | null | undefined;
  delivery_radius_km?: number | string | null | undefined;
  is_active?: boolean | null;
  has_customer_visible_menu?: boolean | null;
  is_accepting_orders?: boolean | null;
  is_available?: boolean | null;
};

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function effectiveRadiusKm(
  globalCapKm: number,
  storeDeliveryRadiusKm: number | string | null | undefined
): number {
  if (storeDeliveryRadiusKm == null) return globalCapKm;
  const v = Number(storeDeliveryRadiusKm);
  if (!Number.isFinite(v) || v <= 0) return globalCapKm;
  return Math.min(globalCapKm, v);
}

/**
 * True when the user is within min(globalCapKm, store.delivery_radius_km)
 * of the store (haversine). Missing coords → not serviceable when geo required.
 */
export function isStoreServiceableAt(
  store: StoreGeoRow,
  userLat: number,
  userLng: number,
  globalCapKm: number
): { ok: boolean; distanceKm: number | null } {
  const slat = toNum(store.latitude);
  const slng = toNum(store.longitude);
  if (slat == null || slng == null) return { ok: false, distanceKm: null };

  const distanceKm = haversineDistanceKm(
    { lat: userLat, lng: userLng },
    { lat: slat, lng: slng }
  );
  const radius = effectiveRadiusKm(globalCapKm, store.delivery_radius_km);
  return { ok: distanceKm <= radius, distanceKm };
}

/**
 * Filter store ids to those serviceable at (lat,lng). Returns map id → distanceKm.
 */
export function filterServiceableStoreIds(
  stores: StoreGeoRow[],
  userLat: number,
  userLng: number,
  globalCapKm: number
): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of stores) {
    if (s.is_active === false) continue;
    if (s.has_customer_visible_menu === false) continue;
    const { ok, distanceKm } = isStoreServiceableAt(s, userLat, userLng, globalCapKm);
    if (ok && distanceKm != null) out.set(Number(s.id), distanceKm);
  }
  return out;
}
