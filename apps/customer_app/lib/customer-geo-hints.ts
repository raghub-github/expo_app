import type { ReverseGeocodeResult } from "@/services/location.service";

function isPincode(value?: string | null): boolean {
  return !!value && /^\d{6}$/.test(value.trim());
}

/** Placeholder / UI labels that must never be sent as geo `state`. */
const INVALID_STATE_LABELS = new Set([
  "current location",
  "current location.",
  "enable location to set",
  "location not available",
  "unknown",
  "n/a",
  "na",
]);

function isValidGeoState(value?: string | null): value is string {
  const t = value?.trim() ?? "";
  if (t.length < 2) return false;
  if (INVALID_STATE_LABELS.has(t.toLowerCase())) return false;
  // Raw coords leaked into address text.
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(t)) return false;
  return true;
}

export function extractCustomerGeoHints(
  address: ReverseGeocodeResult | null | undefined,
  coords?: { latitude: number; longitude: number } | null
): {
  pincode: string | null;
  state: string | null;
  lat: number | null;
  lng: number | null;
} {
  const fullParts = (address?.fullAddress ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const secondaryParts = (address?.secondary ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const rawState =
    address?.state ??
    [...fullParts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== "india") ??
    null;
  const state = isValidGeoState(rawState) ? rawState.trim() : null;

  const pincode =
    (address?.pincode && isPincode(address.pincode) ? address.pincode : null) ??
    [...fullParts, ...secondaryParts].find((p) => isPincode(p)) ??
    null;

  const lat = coords?.latitude != null && Number.isFinite(coords.latitude) ? coords.latitude : null;
  const lng = coords?.longitude != null && Number.isFinite(coords.longitude) ? coords.longitude : null;

  return { pincode, state, lat, lng };
}
