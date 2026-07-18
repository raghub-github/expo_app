/**
 * Display label for the active delivery pin — always from live reverse-geocode
 * or a saved address row, never a hardcoded city/area.
 */

import { matchSavedAddressIdNearCoords } from "@/lib/deliveryDropResolution";
import type { Address } from "@/services/address.service";
import type { ReverseGeocodeResult } from "@/services/location.service";
import type { LocationSource } from "@/store/locationStore";

function isBarePincode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

/** Strip leading 6-digit pincode glued to a place name ("132106 Panipat" → "Panipat"). */
function cleanAddressPart(part: string): string {
  const trimmed = part.trim();
  if (!trimmed) return "";
  if (isBarePincode(trimmed)) return "";
  return trimmed.replace(/^\d{6}\s+/, "").trim();
}

function formatReverseGeocodeLabel(address: ReverseGeocodeResult): string | null {
  const city = address.city?.trim() || null;
  const state = address.state?.trim() || null;
  const primary = address.primary?.trim() || null;
  const secondary = address.secondary?.trim() || null;
  const full = address.fullAddress?.trim() || null;

  if (full && full.toLowerCase() !== "current location") {
    const parts = full
      .split(",")
      .map(cleanAddressPart)
      .filter((p) => !!p && p.toLowerCase() !== "india");
    const deduped = Array.from(new Set(parts));
    if (deduped.length >= 2) {
      const statePart = state && deduped.some((p) => p.toLowerCase() === state.toLowerCase())
        ? state
        : deduped[deduped.length - 1];
      const localityParts = deduped.filter((p) => p.toLowerCase() !== statePart?.toLowerCase()).slice(0, 2);
      if (localityParts.length && statePart) return `${localityParts.join(", ")} (${statePart})`;
      if (localityParts.length) return localityParts.join(", ");
      return deduped.slice(0, 3).join(", ");
    }
    if (deduped.length === 1) {
      return state && deduped[0]!.toLowerCase() !== state.toLowerCase()
        ? `${deduped[0]} (${state})`
        : deduped[0]!;
    }
  }

  if (city && state) return `${city} (${state})`;
  if (primary && secondary) {
    const sec = cleanAddressPart(secondary.split(",")[0] ?? secondary);
    return sec ? `${primary}, ${sec}` : primary;
  }
  if (primary && primary.toLowerCase() !== "current location") return primary;
  if (city) return city;
  if (state) return state;
  return null;
}

export function resolveDeliveryLocationLabel(options: {
  locationSource: LocationSource | null;
  address: ReverseGeocodeResult | null;
  addresses?: Address[];
  coords?: { latitude: number; longitude: number } | null;
}): string {
  const { locationSource, address, addresses = [], coords = null } = options;

  if (locationSource === "selected" && coords && addresses.length > 0) {
    const nearId = matchSavedAddressIdNearCoords(
      addresses,
      coords.latitude,
      coords.longitude,
      0.25
    );
    if (nearId != null) {
      const saved = addresses.find((a) => a.id === nearId);
      const savedFull = saved?.fullAddress?.trim();
      if (savedFull) return savedFull;
      const label = saved?.label?.trim();
      if (label) return label;
    }
  }

  if (locationSource === "selected" && address) {
    const full = address.fullAddress?.trim();
    if (full && full.toLowerCase() !== "current location") return full;
    const secondary = address.secondary?.trim();
    if (secondary) return secondary;
    const primary = address.primary?.trim();
    if (primary) return primary;
  }

  if (address) {
    const formatted = formatReverseGeocodeLabel(address);
    if (formatted) return formatted;
  }

  if (coords?.latitude != null && coords.longitude != null) {
    return "Detecting address…";
  }

  return "Detecting location…";
}
