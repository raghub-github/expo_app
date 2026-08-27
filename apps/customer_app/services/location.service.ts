/**
 * Location service — Mapbox Search Box API (forward + reverse) + local fallback.
 * All search results are restricted to India (country=IN).
 */

import { getConfig } from "@/config/env";
import {
  mapboxSearchReverse,
  ensureMapboxSearchReady,
  type MapboxSearchSessionContext,
} from "@/services/mapboxSearch.service";
import {
  searchLocations,
  toLegacyPlaceResult,
  isPincodeSearchMode,
  type EnrichedPlaceResult,
  type LocationSearchOptions,
} from "@/services/locationSearch.service";
import { reverseGeocodeKey, sameReverseGeocodeCell } from "@/lib/reverseGeocodeCacheKey";

export { sameReverseGeocodeCell };

export {
  resolveMapboxEnrichedPlace,
  resetMapboxSearchSession,
  ensureMapboxSearchReady,
  MAPBOX_SEARCH_DEBOUNCE_MS,
} from "@/services/mapboxSearch.service";
export type { MapboxSearchSessionContext };

const COUNTRY_INDIA = "IN";
const roadDistanceCache = new Map<string, { distanceMeters: number; durationSeconds: number | null }>();

function roadDistanceKey(
  originLongitude: number,
  originLatitude: number,
  destinationLongitude: number,
  destinationLatitude: number
) {
  const oLng = originLongitude.toFixed(5);
  const oLat = originLatitude.toFixed(5);
  const dLng = destinationLongitude.toFixed(5);
  const dLat = destinationLatitude.toFixed(5);
  return `${oLng},${oLat}|${dLng},${dLat}`;
}

export type ReverseGeocodeResult = {
  primary: string;
  secondary: string;
  fullAddress: string;
  /** City (from Mapbox place context). */
  city?: string | null;
  /** State (from Mapbox region context). */
  state?: string | null;
  /** Pincode / postal code (from Mapbox postcode context). */
  pincode?: string | null;
  /** Straight-line metres from the queried GPS point to the resolved feature (data-quality signal). */
  distanceM?: number | null;
  /**
   * True when the nearest mapped feature is far/coarse for the queried point — the
   * street/PIN is a best-effort approximation of sparsely-mapped data, NOT masked as exact.
   */
  approximate?: boolean;
  /** Which provider resolved this (mapbox-v6 / mapbox-searchbox / mapbox-v5). For logging + future fallback. */
  provider?: string;
};

/** Metres beyond which the nearest mapped feature is treated as an approximation of the real point. */
const REVERSE_APPROX_THRESHOLD_M = 45;

function metresBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function isPincodeOnly(value?: string | null): boolean {
  return !!value && /^\d{6}$/.test(value.trim());
}

/** UI placeholders — not useful for rider pickup/drop headings. */
export function isGenericLocationLabel(value?: string | null): boolean {
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

/** Prefer locality / street name over bare pincode for map & list headings. */
export function resolvePlaceDisplayName(input: {
  primary?: string | null;
  secondary?: string | null;
  fullAddress?: string | null;
  city?: string | null;
  state?: string | null;
}): string {
  const fullParts = (input.fullAddress ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const secondaryParts = (input.secondary ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const normalizedState = (input.state ?? "").trim().toLowerCase();
  const normalizedCity = (input.city ?? "").trim().toLowerCase();

  const isMeaningfulPart = (part: string) => {
    const lower = part.toLowerCase();
    return (
      !!part &&
      !isPincodeOnly(part) &&
      !isGenericLocationLabel(part) &&
      lower !== "india" &&
      lower !== normalizedState &&
      lower !== normalizedCity
    );
  };

  const candidates = [
    input.primary,
    ...secondaryParts,
    ...fullParts,
    input.city,
  ].filter((p): p is string => !!p && isMeaningfulPart(p));

  if (candidates.length > 0) return candidates[0];

  return input.fullAddress?.trim() || input.primary?.trim() || "Selected location";
}

type V6Context = Record<string, { name?: string } | undefined> | undefined;

function v6Name(ctx: V6Context, key: string): string | null {
  const v = ctx?.[key];
  return v && typeof v === "object" && typeof v.name === "string" && v.name.trim() ? v.name : null;
}

/**
 * Reverse-geocode with Mapbox Geocoding v6, address-first.
 *
 * WHY: Search Box `/reverse` snaps to the nearest street/POI centroid and
 * frequently returns a road with NO postcode (e.g. it resolves a Bandra pin to
 * "Mumbai Coastal Road" with no PIN). Geocoding v6 `types=address` returns the
 * EXACT street address carrying the point's real PIN — matching Google Maps.
 * That is the root cause of "correct district but wrong street/locality/PIN".
 */
async function mapboxV6Reverse(
  longitude: number,
  latitude: number
): Promise<ReverseGeocodeResult | null> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) return null;
  // Fetch several nearest candidates (NOT just features[0]) so we can choose the
  // closest one that actually carries a postcode, and measure how far it sits from
  // the GPS point (surfaces sparsely-mapped areas instead of masking them).
  const typeTiers: Array<{ types: string; limit: number }> = [
    { types: "address", limit: 5 },
    { types: "street,neighborhood,locality,place,postcode", limit: 3 },
  ];
  for (const tier of typeTiers) {
    const url =
      `https://api.mapbox.com/search/geocode/v6/reverse` +
      `?longitude=${encodeURIComponent(longitude)}&latitude=${encodeURIComponent(latitude)}` +
      `&access_token=${encodeURIComponent(mapboxAccessToken)}` +
      `&country=in&language=en&worldview=in&limit=${tier.limit}&types=${encodeURIComponent(tier.types)}`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      continue;
    }
    if (!res.ok) continue;
    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: { name?: string; full_address?: string; feature_type?: string; context?: V6Context };
      }>;
    };
    const features = data.features ?? [];
    if (!features.length) continue;

    // Candidates arrive proximity-sorted. Prefer the nearest one carrying a postcode,
    // so we never surface a closer point that has no PIN over a slightly-farther real address.
    const scored = features.map((f) => {
      const coords = f.geometry?.coordinates;
      const dist =
        coords && typeof coords[1] === "number" && typeof coords[0] === "number"
          ? metresBetween(latitude, longitude, coords[1], coords[0])
          : Number.POSITIVE_INFINITY;
      return { f, dist, hasPin: !!v6Name(f.properties?.context, "postcode") };
    });
    const chosen =
      scored.filter((s) => s.hasPin).sort((a, b) => a.dist - b.dist)[0] ?? scored[0];
    const props = chosen.f.properties;
    if (!props) continue;
    const ctx = props.context;
    const city = v6Name(ctx, "place") ?? v6Name(ctx, "locality") ?? v6Name(ctx, "district");
    const state = v6Name(ctx, "region");
    const pincode = v6Name(ctx, "postcode");
    const area = v6Name(ctx, "neighborhood") ?? v6Name(ctx, "locality") ?? v6Name(ctx, "street");
    const fullAddress = props.full_address?.trim() || props.name?.trim() || "";
    if (!fullAddress) continue;
    const primary = resolvePlaceDisplayName({ primary: props.name, secondary: area, fullAddress, city, state });
    const secondary = [area, city].filter(Boolean).join(", ") || fullAddress;
    const distanceM = Number.isFinite(chosen.dist) ? chosen.dist : null;
    return {
      primary,
      secondary: secondary.slice(0, 80),
      fullAddress,
      city: city ?? null,
      state: state ?? null,
      pincode: pincode ?? null,
      distanceM,
      approximate: distanceM != null && distanceM > REVERSE_APPROX_THRESHOLD_M,
    };
  }
  return null;
}

/** Search Box /reverse, normalized to ReverseGeocodeResult (POI-centric; no reliable distance). */
async function mapboxSearchBoxReverse(
  longitude: number,
  latitude: number
): Promise<ReverseGeocodeResult | null> {
  const box = await mapboxSearchReverse(longitude, latitude);
  if (!box) return null;
  const primary = resolvePlaceDisplayName({
    primary: box.primary,
    secondary: box.secondary,
    fullAddress: box.fullAddress,
    city: box.city,
    state: box.state,
  });
  return {
    primary,
    secondary: box.secondary.slice(0, 80),
    fullAddress: box.fullAddress,
    city: box.city ?? null,
    state: box.state ?? null,
    pincode: box.pincode ?? null,
  };
}

/** Legacy Geocoding v5 reverse, normalized to ReverseGeocodeResult. */
async function mapboxV5Reverse(
  longitude: number,
  latitude: number
): Promise<ReverseGeocodeResult | null> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${encodeURIComponent(mapboxAccessToken)}&limit=1&types=address,place,locality,neighborhood,poi&language=en&worldview=in`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Mapbox geocode failed: ${res.status}`);
  const data = (await res.json()) as {
    features?: Array<{ place_name?: string; text?: string; context?: Array<{ id: string; text: string }> }>;
  };
  const feature = data.features?.[0];
  if (!feature) return null;
  const placeName = feature.place_name ?? "";
  const context = feature.context ?? [];
  const locality = context.find((c) => c.id.startsWith("locality"))?.text;
  const place = context.find((c) => c.id.startsWith("place"))?.text;
  const neighborhood = context.find((c) => c.id.startsWith("neighborhood"))?.text;
  const region = context.find((c) => c.id.startsWith("region"))?.text;
  const postcode = context.find((c) => c.id.startsWith("postcode"))?.text;
  const fallbackPincode = placeName.match(/\b\d{6}\b/)?.[0] ?? null;
  const rawPrimary = feature.text ?? neighborhood ?? locality ?? place ?? "Current location";
  const secondary =
    [neighborhood, locality, place].filter(Boolean).join(", ") ||
    placeName.split(",").slice(1, 3).join(", ").trim() ||
    "—";
  const city = place ?? locality ?? null;
  const state = region ?? null;
  const primary = resolvePlaceDisplayName({ primary: rawPrimary, secondary, fullAddress: placeName, city, state });
  return {
    primary,
    secondary: secondary.slice(0, 80),
    fullAddress: placeName,
    city,
    state,
    pincode: postcode ?? fallbackPincode,
  };
}

type ReverseProvider = {
  name: string;
  reverse: (longitude: number, latitude: number) => Promise<ReverseGeocodeResult | null>;
};

/**
 * Ordered reverse-geocode providers. Each is tried until one returns a usable address.
 * To add Google later: implement `googleReverse(lng, lat)` and insert `{ name: "google", ... }`
 * here (e.g. first, or after v6) — no other code in the pipeline changes.
 */
const REVERSE_PROVIDERS: ReverseProvider[] = [
  { name: "mapbox-v6", reverse: mapboxV6Reverse },
  { name: "mapbox-searchbox", reverse: mapboxSearchBoxReverse },
  { name: "mapbox-v5", reverse: mapboxV5Reverse },
];

/**
 * Coordinate → address memo (section 20). Nearby GPS points snap to one ~11 m grid
 * cell so we don't re-hit Mapbox for tiny fluctuations while the user stays put. Only
 * successful resolutions are cached; the "none" fallback is never stored.
 */
const REVERSE_GEOCODE_CACHE_TTL_MS = 30 * 60_000;
const REVERSE_GEOCODE_CACHE_MAX = 200;
const reverseGeocodeCache = new Map<string, { result: ReverseGeocodeResult; at: number }>();

/**
 * Reverse geocode lng,lat through the provider chain (v6 address-first → Search Box → v5).
 * Tags the winning provider and a data-quality distance/approximate signal so callers can
 * surface — never mask — sparsely-mapped areas. Results are memoized per ~11 m cell.
 */
export async function reverseGeocode(
  longitude: number,
  latitude: number
): Promise<ReverseGeocodeResult> {
  ensureMapboxSearchReady();

  const cacheKey = reverseGeocodeKey(longitude, latitude);
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < REVERSE_GEOCODE_CACHE_TTL_MS) {
    // Refresh LRU recency.
    reverseGeocodeCache.delete(cacheKey);
    reverseGeocodeCache.set(cacheKey, cached);
    return cached.result;
  }

  for (const provider of REVERSE_PROVIDERS) {
    try {
      const result = await provider.reverse(longitude, latitude);
      if (result && result.fullAddress) {
        const tagged = { ...result, provider: provider.name };
        if (reverseGeocodeCache.size >= REVERSE_GEOCODE_CACHE_MAX) {
          const oldest = reverseGeocodeCache.keys().next().value;
          if (oldest !== undefined) reverseGeocodeCache.delete(oldest);
        }
        reverseGeocodeCache.set(cacheKey, { result: tagged, at: Date.now() });
        return tagged;
      }
    } catch {
      // try next provider
    }
  }

  const { mapboxAccessToken } = getConfig();
  return {
    primary: "Current location",
    secondary: mapboxAccessToken
      ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      : "Enable location or add MAPBOX token",
    fullAddress: mapboxAccessToken
      ? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      : "Location not available",
    city: null,
    state: null,
    pincode: null,
    provider: "none",
    approximate: true,
  };
}

export type PlaceSearchResult = ReverseGeocodeResult & {
  latitude: number;
  longitude: number;
};

/** Re-export enriched type and pincode detection for location picker UI. */
export type { EnrichedPlaceResult } from "@/services/locationSearch.service";
export { isPincodeSearchMode } from "@/services/locationSearch.service";

export type SearchOptions = LocationSearchOptions & {
  sessionContext?: MapboxSearchSessionContext;
};

/**
 * Forward geocode via intelligent search engine (Mapbox + fuzzy + scoring + fallback).
 * Returns legacy shape for backward compatibility.
 */
export async function searchPlaces(
  query: string,
  options?: SearchOptions
): Promise<PlaceSearchResult[]> {
  const enriched = await searchLocations(query, {
    signal: options?.signal,
    proximity: options?.proximity,
    recentLocationKeys: options?.recentLocationKeys,
    sessionContext: options?.sessionContext,
    getLocalSuggestions: options?.getLocalSuggestions,
    getCityAreas: options?.getCityAreas,
  });
  return enriched.map(toLegacyPlaceResult);
}

/**
 * Search places biased toward a location (proximity). India-only.
 * Uses the same intelligent engine as searchPlaces.
 */
export async function searchPlacesWithProximity(
  query: string,
  longitude: number,
  latitude: number,
  options?: { signal?: AbortSignal; recentLocationKeys?: Set<string> }
): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim();
  const minChars = isPincodeSearchMode(trimmed) ? 6 : 2;
  if (trimmed.length < minChars) return [];
  const enriched = await searchLocations(trimmed, {
    signal: options?.signal,
    proximity: { longitude, latitude },
    recentLocationKeys: options?.recentLocationKeys,
  });
  return enriched.map(toLegacyPlaceResult);
}

/**
 * High-precision location search returning enriched results (area, city, state, distance, confidence).
 * Pass getLocalSuggestions and getCityAreas for local fallback and city→areas.
 */
export async function searchPlacesEnriched(
  query: string,
  options?: SearchOptions
): Promise<EnrichedPlaceResult[]> {
  return searchLocations(query, {
    signal: options?.signal,
    proximity: options?.proximity,
    recentLocationKeys: options?.recentLocationKeys,
    getLocalSuggestions: options?.getLocalSuggestions,
    getCityAreas: options?.getCityAreas,
  });
}

export async function getRoadDistance(
  originLongitude: number,
  originLatitude: number,
  destinationLongitude: number,
  destinationLatitude: number
): Promise<{ distanceMeters: number; durationSeconds: number | null }> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) {
    throw new Error("Mapbox token missing for directions.");
  }

  const key = roadDistanceKey(
    originLongitude,
    originLatitude,
    destinationLongitude,
    destinationLatitude
  );
  const cached = roadDistanceCache.get(key);
  if (cached) return cached;

  const coords = `${originLongitude},${originLatitude};${destinationLongitude},${destinationLatitude}`;
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${encodeURIComponent(mapboxAccessToken)}&alternatives=false&overview=false&steps=false`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mapbox directions failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    routes?: Array<{ distance?: number; duration?: number }>;
  };
  const route = data.routes?.[0];
  if (!route?.distance) {
    throw new Error("No drivable route found.");
  }

  const result = {
    distanceMeters: route.distance,
    durationSeconds: typeof route.duration === "number" ? route.duration : null,
  };
  roadDistanceCache.set(key, result);
  return result;
}

/**
 * Geocode an address string to get the first result's coordinates (India-only).
 * Used to resolve pickup location to "city center" for drop suggestions in same city.
 */
export async function geocodeAddressToCoord(
  address: string
): Promise<{ longitude: number; latitude: number } | null> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) return null;

  const trimmed = address.trim();
  if (!trimmed || trimmed.length < 2) return null;

  const encoded = encodeURIComponent(trimmed);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${encodeURIComponent(mapboxAccessToken)}&limit=1&country=${COUNTRY_INDIA}&types=address,place,locality,neighborhood&language=en`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = (await res.json()) as { features?: Array<{ center?: [number, number] }> };
  const center = data.features?.[0]?.center;
  if (!center || center.length < 2) return null;
  return { longitude: center[0], latitude: center[1] };
}

/**
 * Drop suggestions: addresses and landmarks within the pickup city. India-only.
 * Uses the same intelligent search engine with proximity to pickup.
 */
export async function searchDropSuggestionsInCity(
  query: string,
  pickupLongitude: number,
  pickupLatitude: number,
  options?: SearchOptions
): Promise<PlaceSearchResult[]> {
  const trimmed = query.trim();
  const minChars = isPincodeSearchMode(trimmed) ? 6 : 2;
  if (trimmed.length < minChars) return [];
  const enriched = await searchLocations(trimmed, {
    signal: options?.signal,
    proximity: { longitude: pickupLongitude, latitude: pickupLatitude },
    recentLocationKeys: options?.recentLocationKeys,
    getLocalSuggestions: options?.getLocalSuggestions,
    getCityAreas: options?.getCityAreas,
  });
  return enriched.map(toLegacyPlaceResult);
}

export type NearbyPlace = {
  id: string;
  name: string;
  address: string;
  type: "airport" | "railway" | "bus" | "city" | "place";
  icon: string;
};

/**
 * Fetch popular nearby places (airport, railway, bus, city) based on user's current location.
 */
export async function getNearbyPlaces(
  longitude: number,
  latitude: number
): Promise<NearbyPlace[]> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) return getDefaultNearbyPlaces();

  const categories = [
    { query: "airport", type: "airport" as const, icon: "airplane" },
    { query: "railway station", type: "railway" as const, icon: "train" },
    { query: "bus stand", type: "bus" as const, icon: "bus" },
    { query: "city center", type: "city" as const, icon: "business" },
  ];

  const results: NearbyPlace[] = [];
  const proximity = `${longitude},${latitude}`;

  await Promise.all(
    categories.map(async ({ query, type, icon }) => {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${encodeURIComponent(mapboxAccessToken)}&limit=1&country=${COUNTRY_INDIA}&proximity=${encodeURIComponent(proximity)}&types=poi,place`;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as { features?: Array<{ place_name?: string; text?: string; center?: [number, number] }> };
        const feature = data.features?.[0];
        if (feature) {
          results.push({
            id: `${type}-${feature.place_name ?? feature.text}`,
            name: feature.text ?? feature.place_name?.split(",")[0] ?? query,
            address: feature.place_name ?? "",
            type,
            icon,
          });
        }
      } catch {
        // skip
      }
    })
  );

  return results.length > 0 ? results : getDefaultNearbyPlaces();
}

function getDefaultNearbyPlaces(): NearbyPlace[] {
  return [
    { id: "airport", name: "Airport", address: "", type: "airport", icon: "airplane" },
    { id: "railway", name: "Railway station", address: "", type: "railway", icon: "train" },
    { id: "bus", name: "Bus stand", address: "", type: "bus", icon: "bus" },
    { id: "city", name: "City center", address: "", type: "city", icon: "business" },
  ];
}
