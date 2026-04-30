/**
 * Resolves which saved delivery address coordinates checkout uses for routing/billing,
 * so store listing + merchant header can use the same drop point (route-wise km stays consistent).
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
 * Mirrors checkout `selectedAddress` resolution when `selectedAddressId` is still unset:
 * snap pin → saved (250m), else snap active location → saved (80m), else last-used / default / first.
 */
export function resolveCheckoutDeliveryAddress(
  addresses: Address[],
  sessionCoords: { latitude: number; longitude: number } | null,
  locationSource: "selected" | "current" | null,
  activeLocation: { latitude: number | null; longitude: number | null } | null | undefined
): Address | null {
  if (addresses.length === 0) return null;

  let resolvedId: number | null = null;
  if (sessionCoords && locationSource === "selected") {
    resolvedId = matchSavedAddressIdNearCoords(
      addresses,
      sessionCoords.latitude,
      sessionCoords.longitude,
      0.25
    );
  }
  if (
    resolvedId == null &&
    activeLocation?.latitude != null &&
    activeLocation.longitude != null
  ) {
    resolvedId = matchSavedAddressIdNearCoords(
      addresses,
      activeLocation.latitude,
      activeLocation.longitude,
      0.08
    );
  }
  if (resolvedId != null) {
    return addresses.find((a) => a.id === resolvedId) ?? null;
  }
  return (
    addresses.find((a) => a.isLastUsed) ??
    addresses.find((a) => a.isDefault) ??
    addresses[0] ??
    null
  );
}
