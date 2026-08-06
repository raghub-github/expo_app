/**
 * Master geo-location resolver. Single entry point for "given any combination of
 * pincode/state/city/lat/lng, resolve the customer's geo hierarchy UUIDs (state, region,
 * district, division, post_office, pincode) reliably enough that geo-bound platform
 * offers and per-state/region delivery slabs can be matched."
 *
 * Resolution cascade (in order, each falling through to the next when unusable):
 *   1. Explicit pincode/state from the caller (e.g. live values from the customer app's
 *      location store, freshly geocoded by Mapbox in the app).
 *   2. Saved-address columns (already merged into the caller's pincode/state args).
 *   3. Reverse-geocode lat/lng via Mapbox (cached in-memory; result also persisted by
 *      the caller back to customer_addresses to avoid repeating the call).
 *   4. State-name fallback when the pincode→post_office chain in pincode_post_offices
 *      is incomplete (state is matched by name in the `states` table).
 *
 * Em-dash and other "no value" placeholders ("—", "-", "N/A", "null", etc.) are treated
 * as missing — the customer app stores those when reverse-geocoding fails at save time
 * because the customer_addresses columns are NOT NULL.
 */

import {
  resolveDropGeoRefsFromPincode,
  resolvePlatformOfferGeoBindingEffectiveIds,
  resolveCheckoutCouponGeoBindingEffectiveIds,
} from "./geoRefFromPincode.js";
import { reverseGeocodeCoords, type ReverseGeocodeBackendResult } from "../../services/mapbox/geocoding.js";
import type { DropGeoRefByLevel } from "./types.js";

/* ------------------------------------------------------------------------- */
/* Sanitization                                                              */
/* ------------------------------------------------------------------------- */

const PLACEHOLDER_TOKENS = new Set([
  "—", "–", "-", "--", "---",
  "n/a", "na", "null", "none", "unknown", "undefined", "",
]);

function sanitize(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  if (!t) return null;
  if (PLACEHOLDER_TOKENS.has(t.toLowerCase())) return null;
  return t;
}

/* ------------------------------------------------------------------------- */
/* In-memory LRU cache for reverse-geocoded coords                           */
/* ------------------------------------------------------------------------- */

type RGEntry = { value: ReverseGeocodeBackendResult | null; expiresAt: number };

const RG_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RG_CACHE_MAX_ENTRIES = 5_000;
const rgCache = new Map<string, RGEntry>();

/** Round to ~110m precision so nearby lookups share a cache slot. */
function rgKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)},${lng.toFixed(3)}`;
}

function rgGet(lat: number, lng: number): ReverseGeocodeBackendResult | null | undefined {
  const k = rgKey(lat, lng);
  const hit = rgCache.get(k);
  if (!hit) return undefined;
  if (Date.now() > hit.expiresAt) {
    rgCache.delete(k);
    return undefined;
  }
  // touch for LRU (re-insert at the back)
  rgCache.delete(k);
  rgCache.set(k, hit);
  return hit.value;
}

function rgSet(lat: number, lng: number, value: ReverseGeocodeBackendResult | null): void {
  const k = rgKey(lat, lng);
  rgCache.set(k, { value, expiresAt: Date.now() + RG_CACHE_TTL_MS });
  if (rgCache.size > RG_CACHE_MAX_ENTRIES) {
    // evict oldest
    const oldest = rgCache.keys().next().value;
    if (oldest != null) rgCache.delete(oldest);
  }
}

/** Cached wrapper around `reverseGeocodeCoords`. Negative results are cached too. */
async function reverseGeocodeCoordsCached(
  lat: number,
  lng: number,
): Promise<ReverseGeocodeBackendResult | null> {
  const cached = rgGet(lat, lng);
  if (cached !== undefined) return cached;
  let result: ReverseGeocodeBackendResult | null = null;
  try {
    result = await reverseGeocodeCoords(lat, lng);
  } catch {
    result = null;
  }
  rgSet(lat, lng, result);
  return result;
}

/* ------------------------------------------------------------------------- */
/* The master resolver                                                       */
/* ------------------------------------------------------------------------- */

export type ResolveGeoLocationInput = {
  /** Live values from the caller (e.g. customer app's location store). */
  livePincode?: string | null;
  liveState?: string | null;
  liveCity?: string | null;
  /** Saved-address values (e.g. from customer_addresses row). */
  savedPincode?: string | null;
  savedState?: string | null;
  savedCity?: string | null;
  /** Coordinates (used as last-resort to reverse-geocode). */
  latitude?: number | null;
  longitude?: number | null;
};

export type ResolveGeoLocationResult = {
  /** Pincode text used for chain lookup. */
  pincode: string | null;
  /** State name used for fallback chain lookup. */
  stateName: string | null;
  /** City name. */
  city: string | null;
  /** Geo hierarchy UUIDs (pincode/post_office/division/district/region/state). */
  refs: DropGeoRefByLevel | null;
  /** Effective platform offer IDs at the resolved location (closest-binding wins). */
  geoBoundOfferIds: ReadonlySet<number>;
  /** Effective checkout coupon IDs at the resolved location. */
  geoBoundCouponIds: ReadonlySet<number>;
  /** Which source supplied each value — useful for diagnostics. */
  source: {
    pincode: "live" | "saved" | "reverse-geocode" | "none";
    state: "live" | "saved" | "reverse-geocode" | "none";
    city: "live" | "saved" | "reverse-geocode" | "none";
  };
  /** Result of the Mapbox reverse-geocode call, if it ran. Caller may persist. */
  reverseGeocoded: ReverseGeocodeBackendResult | null;
};

/**
 * Resolve a customer's geo hierarchy from any combination of inputs.
 *
 * Cascade:
 *   1. live values → 2. saved values → 3. reverse-geocode lat/lng → 4. state-name fallback
 *
 * Returns refs (geo UUIDs) and the effective platform-offer IDs bound at any ancestor
 * level via `geo_platform_offer_bindings`. The caller is responsible for persisting
 * `reverseGeocoded` back to its source row when applicable.
 */
export async function resolveGeoLocation(
  input: ResolveGeoLocationInput,
): Promise<ResolveGeoLocationResult> {
  const livePincode = sanitize(input.livePincode);
  const liveState = sanitize(input.liveState);
  const liveCity = sanitize(input.liveCity);
  const savedPincode = sanitize(input.savedPincode);
  const savedState = sanitize(input.savedState);
  const savedCity = sanitize(input.savedCity);

  let pincode: string | null = livePincode ?? savedPincode;
  let stateName: string | null = liveState ?? savedState;
  let city: string | null = liveCity ?? savedCity;
  const source: ResolveGeoLocationResult["source"] = {
    pincode: livePincode ? "live" : savedPincode ? "saved" : "none",
    state: liveState ? "live" : savedState ? "saved" : "none",
    city: liveCity ? "live" : savedCity ? "saved" : "none",
  };

  // Step 3: reverse-geocode if anything is still missing and we have valid coords.
  let reverseGeocoded: ReverseGeocodeBackendResult | null = null;
  const lat = input.latitude == null ? NaN : Number(input.latitude);
  const lng = input.longitude == null ? NaN : Number(input.longitude);
  if (
    (!pincode || !stateName) &&
    Number.isFinite(lat) && Number.isFinite(lng) &&
    !(lat === 0 && lng === 0)
  ) {
    reverseGeocoded = await reverseGeocodeCoordsCached(lat, lng);
    if (reverseGeocoded) {
      if (!pincode && reverseGeocoded.pincode) {
        pincode = sanitize(reverseGeocoded.pincode);
        if (pincode) source.pincode = "reverse-geocode";
      }
      if (!stateName && reverseGeocoded.state) {
        stateName = sanitize(reverseGeocoded.state);
        if (stateName) source.state = "reverse-geocode";
      }
      if (!city && reverseGeocoded.city) {
        city = sanitize(reverseGeocoded.city);
        if (city) source.city = "reverse-geocode";
      }
    }
  }

  // Step 4: chain walk + state-name fallback inside resolveDropGeoRefsFromPincode.
  const refs = await resolveDropGeoRefsFromPincode(pincode, stateName);
  const [geoBoundOfferIds, geoBoundCouponIds] = await Promise.all([
    resolvePlatformOfferGeoBindingEffectiveIds(refs),
    resolveCheckoutCouponGeoBindingEffectiveIds(refs),
  ]);

  return { pincode, stateName, city, refs, geoBoundOfferIds, geoBoundCouponIds, source, reverseGeocoded };
}
