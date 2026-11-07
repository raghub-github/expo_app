/**
 * Location service — Mapbox Search Box API (forward + reverse) + local fallback.
 * All search results are restricted to India (country=IN).
 */

import * as Location from "expo-location";
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
import { runHedged, type HedgedProvider } from "@/lib/hedgedRequest";
import { parseV6Reverse, type V6ReverseFeature } from "@/lib/mapboxReverseParse";

export { sameReverseGeocodeCell };

export {
  resolveMapboxEnrichedPlace,
  resetMapboxSearchSession,
  ensureMapboxSearchReady,
  MAPBOX_SEARCH_DEBOUNCE_MS,
} from "@/services/mapboxSearch.service";
export type { MapboxSearchSessionContext };

const COUNTRY_INDIA = "IN";
const ROAD_DISTANCE_TIMEOUT_MS = 4_000;
/** Matrix API limit is 25 coordinates including the origin. */
const MATRIX_MAX_DESTINATIONS = 24;
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

/**
 * Reverse-geocode with Mapbox Geocoding v6, the accurate provider.
 *
 * WHY v6: Search Box `/reverse` snaps to the nearest street/POI centroid and frequently
 * returns a road with NO postcode, whereas v6 returns the point's real PIN. One request
 * with no `types` gets the full hierarchy; see parseV6Reverse.
 */
async function mapboxV6Reverse(
  longitude: number,
  latitude: number,
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) return null;
  const url =
    `https://api.mapbox.com/search/geocode/v6/reverse` +
    `?longitude=${encodeURIComponent(longitude)}&latitude=${encodeURIComponent(latitude)}` +
    `&access_token=${encodeURIComponent(mapboxAccessToken)}` +
    `&country=in&language=en&worldview=in`;
  const res = await fetch(url, { signal });
  if (!res.ok) return null;
  const data = (await res.json()) as { features?: V6ReverseFeature[] };
  const parsed = parseV6Reverse(data.features, latitude, longitude);
  if (!parsed) return null;
  const primary = resolvePlaceDisplayName({
    primary: parsed.name,
    secondary: parsed.area,
    fullAddress: parsed.fullAddress,
    city: parsed.city,
    state: parsed.state,
  });
  const secondary = [parsed.area, parsed.city].filter(Boolean).join(", ") || parsed.fullAddress;
  return {
    primary,
    secondary: secondary.slice(0, 80),
    fullAddress: parsed.fullAddress,
    city: parsed.city,
    state: parsed.state,
    pincode: parsed.pincode,
    distanceM: parsed.distanceM,
    approximate: parsed.approximate,
  };
}

/** Search Box /reverse, normalized to ReverseGeocodeResult (POI-centric; no reliable distance). */
async function mapboxSearchBoxReverse(
  longitude: number,
  latitude: number,
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> {
  const box = await mapboxSearchReverse(longitude, latitude, signal);
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
  latitude: number,
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) return null;
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${encodeURIComponent(mapboxAccessToken)}&limit=1&types=address,place,locality,neighborhood,poi&language=en&worldview=in`;
  const res = await fetch(url, { signal });
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

/**
 * The phone's own geocoder: no Mapbox dependency, so it still answers when Mapbox is
 * unreachable or the token is rejected. Last in the chain because its results are less
 * consistent, but a real place name beats the bare "Current location" fallback.
 */
async function deviceReverse(
  longitude: number,
  latitude: number,
  signal?: AbortSignal
): Promise<ReverseGeocodeResult | null> {
  const [hit] = await Location.reverseGeocodeAsync({ latitude, longitude });
  if (!hit || signal?.aborted) return null;
  const city = hit.city ?? hit.subregion ?? null;
  const state = hit.region ?? null;
  const area = hit.district ?? hit.street ?? null;
  const name = hit.name ?? area ?? city;
  if (!name) return null;
  const fullAddress = [name, area !== name ? area : null, city, state, hit.postalCode, "India"]
    .filter(Boolean)
    .join(", ");
  return {
    primary: resolvePlaceDisplayName({ primary: name, secondary: area, fullAddress, city, state }),
    secondary: ([area, city].filter(Boolean).join(", ") || fullAddress).slice(0, 80),
    fullAddress,
    city,
    state,
    pincode: hit.postalCode ?? null,
    approximate: true,
  };
}

/**
 * Reverse-geocode providers, best first. v6 answers in ~200 ms when healthy, so the hedge
 * delays are set well past that: each extra provider runs only if the one before it has
 * stalled or come back empty. To add Google later, insert it here; nothing else changes.
 */
const reverseProviders = (
  longitude: number,
  latitude: number
): Array<HedgedProvider<ReverseGeocodeResult>> => [
  {
    name: "mapbox-v6",
    hedgeAfterMs: 0,
    timeoutMs: 4_000,
    run: (signal) => mapboxV6Reverse(longitude, latitude, signal),
  },
  {
    name: "mapbox-searchbox",
    hedgeAfterMs: 900,
    timeoutMs: 4_000,
    run: (signal) => mapboxSearchBoxReverse(longitude, latitude, signal),
  },
  {
    name: "mapbox-v5",
    hedgeAfterMs: 1_800,
    timeoutMs: 4_000,
    run: (signal) => mapboxV5Reverse(longitude, latitude, signal),
  },
  {
    name: "device",
    hedgeAfterMs: 2_800,
    timeoutMs: 3_000,
    run: (signal) => deviceReverse(longitude, latitude, signal),
  },
];

/**
 * Coordinate → address memo (section 20). Nearby GPS points snap to one ~11 m grid
 * cell so we don't re-hit Mapbox for tiny fluctuations while the user stays put. Only
 * successful resolutions are cached; the "none" fallback is never stored.
 */
const REVERSE_GEOCODE_CACHE_TTL_MS = 30 * 60_000;
const REVERSE_GEOCODE_CACHE_MAX = 200;
const reverseGeocodeCache = new Map<string, { result: ReverseGeocodeResult; at: number }>();
/** Header, map pin and address form often ask about the same spot at once: share one call. */
const reverseGeocodeInFlight = new Map<string, Promise<ReverseGeocodeResult>>();

/** Paint last-known address instantly on the next GPS cell hit (no Mapbox wait). */
export function seedReverseGeocodeCache(
  longitude: number,
  latitude: number,
  result: ReverseGeocodeResult | null | undefined
): void {
  if (!result?.fullAddress && !result?.primary) return;
  if ((result.primary ?? "").toLowerCase() === "current location" && !result.city && !result.state) {
    return;
  }
  const cacheKey = reverseGeocodeKey(longitude, latitude);
  reverseGeocodeCache.set(cacheKey, { result, at: Date.now() });
}

/** True when reverseGeocode found no real place and returned its "Current location" stand-in. */
export function isUnresolvedReverseResult(result: ReverseGeocodeResult | null | undefined): boolean {
  return !result || result.provider === "none";
}

/**
 * Reverse geocode lng,lat through the hedged provider chain (see reverseProviders).
 * Results are memoized per ~11 m cell and concurrent calls for a cell share one request.
 * Never rejects: when nothing resolves it returns a placeholder with provider "none".
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

  const pending = reverseGeocodeInFlight.get(cacheKey);
  if (pending) return pending;

  const request = (async (): Promise<ReverseGeocodeResult> => {
    const hit = await runHedged(reverseProviders(longitude, latitude));
    if (hit) {
      const tagged = { ...hit.value, provider: hit.provider };
      if (reverseGeocodeCache.size >= REVERSE_GEOCODE_CACHE_MAX) {
        const oldest = reverseGeocodeCache.keys().next().value;
        if (oldest !== undefined) reverseGeocodeCache.delete(oldest);
      }
      reverseGeocodeCache.set(cacheKey, { result: tagged, at: Date.now() });
      return tagged;
    }
    const { mapboxAccessToken } = getConfig();
    return {
      primary: "Current location",
      // Never surface raw GPS as the customer-facing place name.
      secondary: mapboxAccessToken ? "" : "Enable location or add MAPBOX token",
      fullAddress: mapboxAccessToken ? "Current location" : "Location not available",
      city: null,
      state: null,
      pincode: null,
      provider: "none",
      approximate: true,
    };
  })().finally(() => {
    reverseGeocodeInFlight.delete(cacheKey);
  });
  reverseGeocodeInFlight.set(cacheKey, request);
  return request;
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
  return searchLocations(query, options);
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROAD_DISTANCE_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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
 * Road distance from one origin to many destinations in ONE request (Matrix API), for
 * result lists. Calling Directions per row sent 8 parallel requests on every keystroke.
 * Destinations without a route are left out; callers show straight-line distance instead.
 */
export async function getRoadDistancesFrom(
  origin: { longitude: number; latitude: number },
  destinations: Array<{ longitude: number; latitude: number }>
): Promise<Array<number | null>> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken || destinations.length === 0) return destinations.map(() => null);
  const batch = destinations.slice(0, MATRIX_MAX_DESTINATIONS);
  const coords = [origin, ...batch].map((c) => `${c.longitude},${c.latitude}`).join(";");
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}?sources=0&annotations=distance&access_token=${encodeURIComponent(mapboxAccessToken)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ROAD_DISTANCE_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return destinations.map(() => null);
    const data = (await res.json()) as { distances?: Array<Array<number | null>> };
    const row = data.distances?.[0] ?? [];
    return destinations.map((_, i) => {
      const meters = i < batch.length ? row[i + 1] : null;
      return typeof meters === "number" ? meters : null;
    });
  } catch {
    return destinations.map(() => null);
  } finally {
    clearTimeout(timer);
  }
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
