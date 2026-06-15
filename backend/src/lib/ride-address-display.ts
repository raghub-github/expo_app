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

function firstMeaningfulAddressPart(fullAddress: string): string | undefined {
  const parts = fullAddress
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    if (isGenericRideLocationLabel(part)) continue;
    if (/^\d{6}$/.test(part)) continue;
    if (part.toLowerCase() === "india") continue;
    return part;
  }
  return undefined;
}

/** Rider-facing ride stop label — never "Current location" when a real address exists. */
export function resolveRideAddressDisplayLabel(args: {
  label?: string | null;
  fullAddress?: string | null;
  fallbacks?: (string | null | undefined)[];
  defaultLabel: string;
}): string {
  const label = args.label?.trim();
  if (label && !isGenericRideLocationLabel(label)) return label;

  const full = args.fullAddress?.trim();
  if (full && !isGenericRideLocationLabel(full)) {
    return firstMeaningfulAddressPart(full) ?? full;
  }

  for (const c of args.fallbacks ?? []) {
    const t = c?.trim();
    if (!t || isGenericRideLocationLabel(t) || isCoordinateLikeAddressText(t)) continue;
    return t;
  }

  return args.defaultLabel;
}
