import type { ReverseGeocodeResult } from "@/services/location.service";

function isPincode(value?: string | null): boolean {
  return !!value && /^\d{6}$/.test(value.trim());
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

  const state =
    address?.state ??
    [...fullParts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== "india") ??
    null;

  const pincode =
    (address?.pincode && isPincode(address.pincode) ? address.pincode : null) ??
    [...fullParts, ...secondaryParts].find((p) => isPincode(p)) ??
    null;

  const lat = coords?.latitude != null && Number.isFinite(coords.latitude) ? coords.latitude : null;
  const lng = coords?.longitude != null && Number.isFinite(coords.longitude) ? coords.longitude : null;

  return { pincode, state, lat, lng };
}
