/** City/area hints for /v1/weather/location — never pass state names or placeholders. */

import type { ReverseGeocodeResult } from "@/services/location.service";

function isPincode(value?: string | null): boolean {
  return !!value && /^\d{6}$/.test(value.trim());
}

export function resolveHomeLocationPrimary(address: ReverseGeocodeResult | null): string {
  if (!address) return "Current location";

  const fullParts = (address.fullAddress ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const secondaryParts = (address.secondary ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const stateCandidate =
    address.state ??
    [...fullParts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== "india");
  const normalizedState = stateCandidate?.toLowerCase() ?? "";
  const areaLocalityCandidates = [...secondaryParts, ...fullParts, address.primary ?? ""]
    .map((p) => p.trim())
    .filter(
      (p) =>
        !!p &&
        !isPincode(p) &&
        p.toLowerCase() !== "india" &&
        p.toLowerCase() !== normalizedState
    );

  const dedupedAreaLocality = Array.from(new Set(areaLocalityCandidates));
  return dedupedAreaLocality.slice(0, 2).join(", ") || "Current location";
}

export function resolveHomeWeatherQueryParams(
  address: ReverseGeocodeResult | null,
  coords: { latitude: number; longitude: number } | null
) {
  const locationPrimary = resolveHomeLocationPrimary(address);
  const fullParts = (address?.fullAddress ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const stateCandidate =
    address?.state ??
    [...fullParts].reverse().find((p) => !isPincode(p) && p.toLowerCase() !== "india");

  return {
    lat: coords?.latitude,
    lng: coords?.longitude,
    area: locationPrimary,
    city: resolveWeatherCityFromAddress({
      city: address?.city,
      state: address?.state ?? stateCandidate,
      fullAddress: address?.fullAddress,
      areaFallback: locationPrimary,
    }),
  };
}

function isPlaceholder(value?: string | null): boolean {
  if (!value?.trim()) return true;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  return (
    trimmed === "—" ||
    trimmed === "-" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "unknown" ||
    lower === "current location"
  );
}

export function resolveWeatherCityFromAddress(args: {
  city?: string | null;
  state?: string | null;
  fullAddress?: string | null;
  areaFallback?: string | null;
}): string | undefined {
  const stateNorm = args.state?.trim().toLowerCase();
  if (args.city?.trim() && !isPlaceholder(args.city)) {
    const city = args.city.trim();
    if (city.toLowerCase() !== stateNorm) return city;
  }

  const parts = (args.fullAddress ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => p.toLowerCase() !== "india" && !/^\d{6}$/.test(p));

  if (parts.length >= 3) {
    const candidate = parts[parts.length - 2];
    if (candidate && candidate.toLowerCase() !== stateNorm && !isPlaceholder(candidate)) {
      return candidate;
    }
  }
  if (parts.length >= 2) {
    const candidate = parts[1];
    if (candidate && candidate.toLowerCase() !== stateNorm && !isPlaceholder(candidate)) {
      return candidate;
    }
  }
  if (parts[0] && !isPlaceholder(parts[0])) return parts[0];

  const areaFirst = args.areaFallback?.split(",")[0]?.trim();
  if (areaFirst && !isPlaceholder(areaFirst) && areaFirst.toLowerCase() !== stateNorm) {
    return areaFirst;
  }

  return undefined;
}
