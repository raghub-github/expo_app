/** Merchant panel: rider heading to store vs reached store (Reach Store on rider app). */

import {
  hasRiderReachedMerchant as hasRiderReachedMerchantCore,
  resolveRiderDisplayVariant,
  riderEnRouteToMerchant,
  type RiderMerchantDisplayInput,
} from '@/lib/rider-merchant-display-state';

export type RiderMerchantArrivalOrder = RiderMerchantDisplayInput;

export { resolveRiderDisplayVariant, riderEnRouteToMerchant };

export function hasRiderReachedMerchant(order: RiderMerchantArrivalOrder): boolean {
  return hasRiderReachedMerchantCore(order);
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const r = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Urban bike ETA (~21 km/h). */
const RIDER_APPROACH_KM_PER_MIN = 0.35;

export function formatDistanceAwayLabel(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return '';
  if (distanceKm < 1) {
    const m = Math.max(50, Math.round(distanceKm * 1000));
    return `${m} m away`;
  }
  const rounded = Math.round(distanceKm * 10) / 10;
  return `${rounded % 1 === 0 ? rounded : rounded.toFixed(1)} km away`;
}

export function estimateRiderToMerchantArrival(
  riderLat: number,
  riderLng: number,
  pickupLat: number,
  pickupLng: number
): { distanceKm: number; etaMinutes: number } | null {
  if (
    !Number.isFinite(riderLat) ||
    !Number.isFinite(riderLng) ||
    !Number.isFinite(pickupLat) ||
    !Number.isFinite(pickupLng)
  ) {
    return null;
  }
  const distanceKm = haversineKm(riderLat, riderLng, pickupLat, pickupLng);
  if (!Number.isFinite(distanceKm)) return null;
  const etaMinutes = Math.max(1, Math.round(distanceKm / RIDER_APPROACH_KM_PER_MIN));
  return { distanceKm, etaMinutes };
}

export function formatRiderToMerchantArrivalSubtitle(
  distanceKm: number | null | undefined,
  etaMinutes?: number | null
): string | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  const distLabel = formatDistanceAwayLabel(distanceKm);
  if (!distLabel) return null;
  const mins =
    etaMinutes != null && Number.isFinite(etaMinutes) && etaMinutes > 0
      ? Math.max(1, Math.round(etaMinutes))
      : Math.max(1, Math.round(distanceKm / RIDER_APPROACH_KM_PER_MIN));
  return `Arriving in ${mins} min · ${distLabel}`;
}

export function formatRiderToMerchantArrivalFromMeters(
  remainingDistanceM: number | null | undefined,
  etaMinutes?: number | null
): string | null {
  if (remainingDistanceM == null || !Number.isFinite(remainingDistanceM)) return null;
  return formatRiderToMerchantArrivalSubtitle(
    remainingDistanceM / 1000,
    etaMinutes
  );
}
