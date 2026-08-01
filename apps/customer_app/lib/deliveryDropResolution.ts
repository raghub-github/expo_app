/**
 * Resolves which saved delivery address coordinates checkout uses for routing/billing,
 * so store listing + merchant header can use the same drop point (route-wise km stays consistent).
 *
 * Backend `activeLocation.addressId` is the single source of truth when present and the
 * user is not in live-GPS (`current`) mode.
 */

import { haversineKm } from "@/lib/billSummary";
import type { Address } from "@/services/address.service";

/** Pick saved address id nearest to (lat,lng) within maxKm (same thresholds as checkout). */
export function matchSavedAddressIdNearCoords(
  addresses: Address[],
  lat: number,
  lng: number,
  maxKm: number
): number | null {
  let best: { id: number; km: number } | null = null;
  for (const a of addresses) {
    const km = haversineKm(a.latitude, a.longitude, lat, lng);
    if (km <= maxKm && (!best || km < best.km)) best = { id: a.id, km };
  }
  return best?.id ?? null;
}

/**
 * Resolves a saved delivery address for checkout / quotes.
 *
 * Prefer backend-bound `activeLocation.addressId` whenever present and the session is
 * not explicitly on live GPS. Never invent a far default/home when the pin is map-only
 * or GPS-only without a nearby saved row — return null so checkout prompts selection.
 */
export function resolveCheckoutDeliveryAddress(
  addresses: Address[],
  sessionCoords: { latitude: number; longitude: number } | null,
  locationSource: "selected" | "current" | null,
  activeLocation:
    | {
        latitude: number | null;
        longitude: number | null;
        addressId?: number | null;
      }
    | null
    | undefined
): Address | null {
  if (addresses.length === 0) return null;

  const boundId = activeLocation?.addressId ?? null;

  // Live GPS must never snap to a far bound remote address (order-for-someone-else).
  if (locationSource === "current") {
    if (!sessionCoords) return null;
    const nearId = matchSavedAddressIdNearCoords(
      addresses,
      sessionCoords.latitude,
      sessionCoords.longitude,
      0.25
    );
    return nearId != null ? (addresses.find((a) => a.id === nearId) ?? null) : null;
  }

  // Selected / bootstrap (null source): honor backend binding first.
  if (boundId != null && addresses.some((a) => a.id === boundId)) {
    return addresses.find((a) => a.id === boundId) ?? null;
  }

  // Map pin / proximity only — no far default invent.
  if (sessionCoords) {
    const nearId = matchSavedAddressIdNearCoords(
      addresses,
      sessionCoords.latitude,
      sessionCoords.longitude,
      0.25
    );
    if (nearId != null) return addresses.find((a) => a.id === nearId) ?? null;
  }

  if (
    activeLocation?.latitude != null &&
    activeLocation.longitude != null
  ) {
    const nearId = matchSavedAddressIdNearCoords(
      addresses,
      activeLocation.latitude,
      activeLocation.longitude,
      0.08
    );
    if (nearId != null) return addresses.find((a) => a.id === nearId) ?? null;
  }

  return null;
}
