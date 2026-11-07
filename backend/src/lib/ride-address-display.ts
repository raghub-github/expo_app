import { isCoordinateLikeAddressText } from "./resolve-order-map-coordinates.js";

/** Booking-time display labels stored in orders_core.checkout_metadata for rides. */

export type RideAddressCheckoutMeta = {
  pickupLabel?: string;
  dropLabel?: string;
  pickupFullAddress?: string;
  dropFullAddress?: string;
  /** Canonical booking-time route distance (km) — same as customer fare quote. */
  routeDistanceKm?: number;
  tripKm?: number;
  pickupPincode?: string;
  pickupState?: string;
  /** Free OTP grace minutes from geo rider slab (waiting_start_after). */
  pickupWaitFreeMinutes?: number;
};

function parsePositiveKm(value: unknown): number | undefined {
  const km = Number(value);
  if (!Number.isFinite(km) || km <= 0) return undefined;
  return Math.round(km * 100) / 100;
}

/** One-decimal km — matches customer searching screen display. */
export function roundRideTripDistanceKm(km: number | null | undefined): number | undefined {
  if (km == null || !Number.isFinite(km) || km <= 0) return undefined;
  return Math.round(km * 10) / 10;
}

export function rideTripDistanceFromCheckoutMetadata(metadata: unknown): number | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const m = metadata as Record<string, unknown>;
  return roundRideTripDistanceKm(parsePositiveKm(m.routeDistanceKm ?? m.tripKm));
}

export function rideGeoFromCheckoutMetadata(metadata: unknown): {
  pickupPincode?: string;
  pickupState?: string;
} {
  if (!metadata || typeof metadata !== "object") return {};
  const m = metadata as Record<string, unknown>;
  const pickupPincode =
    typeof m.pickupPincode === "string" ? m.pickupPincode.trim() : undefined;
  const pickupState =
    typeof m.pickupState === "string" ? m.pickupState.trim() : undefined;
  return { pickupPincode, pickupState };
}

export function rideAddressLabelsFromCheckoutMetadata(
  metadata: unknown
): RideAddressCheckoutMeta {
  if (!metadata || typeof metadata !== "object") return {};
  const m = metadata as Record<string, unknown>;
  const pickupLabel =
    typeof m.pickupLabel === "string" ? m.pickupLabel.trim() : undefined;
  const dropLabel = typeof m.dropLabel === "string" ? m.dropLabel.trim() : undefined;
  const pickupFullAddress =
    typeof m.pickupFullAddress === "string" ? m.pickupFullAddress.trim() : undefined;
  const dropFullAddress =
    typeof m.dropFullAddress === "string" ? m.dropFullAddress.trim() : undefined;
  return { pickupLabel, dropLabel, pickupFullAddress, dropFullAddress };
}

/** UI placeholders — not useful for rider pickup/drop headings. */
export function isGenericRideLocationLabel(value?: string | null): boolean {
  if (!value?.trim()) return true;
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  return (
    trimmed === "—" ||
    trimmed === "-" ||
    lower === "n/a" ||
    lower === "na" ||
    lower === "unknown" ||
    lower === "current location" ||
    lower === "pickup point" ||
    lower === "pickup location" ||
    lower === "drop location" ||
    lower === "selected location" ||
    lower === "location not available"
  );
}

/**
 * Short saved-place nicknames (Home / Work / Office) — fine for customer UI,
 * but riders need a street-level address on the offer sheet.
 */
export function isSavedPlaceNickname(value?: string | null): boolean {
  if (!value?.trim()) return false;
  const trimmed = value.trim();
  if (isGenericRideLocationLabel(trimmed)) return false;
  if (trimmed.includes(",")) return false;
  if (trimmed.length > 28) return false;
  const lower = trimmed.toLowerCase();
  const known = new Set([
    "home",
    "work",
    "office",
    "gym",
    "school",
    "college",
    "hostel",
    "pg",
    "apartment",
    "flat",
    "house",
    "mom",
    "dad",
    "parents",
  ]);
  if (known.has(lower)) return true;
  // Single short token without digits — treat as nickname (e.g. "HOME", "Ravi").
  if (!/\d/.test(trimmed) && !/\s/.test(trimmed) && trimmed.length <= 16) return true;
  return false;
}

/** Prefer a multi-segment street snippet over a lone city name. */
export function meaningfulAddressSnippet(fullAddress: string): string | undefined {
  const parts = fullAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const kept: string[] = [];
  for (const part of parts) {
    if (isGenericRideLocationLabel(part)) continue;
    if (/^\d{6}$/.test(part)) continue;
    if (part.toLowerCase() === "india") continue;
    if (isCoordinateLikeAddressText(part)) continue;
    kept.push(part);
    if (kept.length >= 3) break;
  }
  if (kept.length === 0) return undefined;
  return kept.join(", ");
}

function pickBestAddressCandidate(raw: string): string | null {
  const t = raw.trim();
  if (!t || isGenericRideLocationLabel(t) || isCoordinateLikeAddressText(t)) return null;
  if (isSavedPlaceNickname(t)) return null;
  // Already a multi-part / street-like string — keep (trim very long lines).
  if (t.includes(",")) {
    return meaningfulAddressSnippet(t) ?? t.slice(0, 120);
  }
  // Single line with house/road cues.
  if (/\d/.test(t) || /\b(road|rd|street|st|sector|near|marg|nagar|colony|lane)\b/i.test(t)) {
    return t.length > 120 ? t.slice(0, 117) + "…" : t;
  }
  // Lone city/village token — weak, but better than nothing if no fuller string exists.
  return t;
}

/** Rider-facing ride stop label — street/area first, never just "HOME". */
export function resolveRideAddressDisplayLabel(args: {
  label?: string | null;
  fullAddress?: string | null;
  fallbacks?: (string | null | undefined)[];
  defaultLabel: string;
}): string {
  const candidates: string[] = [];
  if (args.fullAddress?.trim()) candidates.push(args.fullAddress.trim());
  for (const c of args.fallbacks ?? []) {
    if (c?.trim()) candidates.push(c.trim());
  }
  // Saved nickname last — only if nothing street-like exists.
  const label = args.label?.trim();
  if (label && !isGenericRideLocationLabel(label) && !isSavedPlaceNickname(label)) {
    candidates.push(label);
  }

  for (const c of candidates) {
    const picked = pickBestAddressCandidate(c);
    if (picked) return picked;
  }

  // Last resort: show nickname rather than "Pickup" when that is all we have.
  if (label && !isGenericRideLocationLabel(label)) return label;

  return args.defaultLabel;
}
