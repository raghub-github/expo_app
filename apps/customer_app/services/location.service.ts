/**
 * Location service - reverse geocode and forward search using Mapbox Geocoding API.
 * All search results are restricted to India (country=IN).
 * Enhanced for street-level accuracy and fast real-time suggestions (autocomplete, cache, abort).
 */

import { getConfig } from "@/config/env";

const COUNTRY_INDIA = "IN";
const CACHE_TTL_MS = 25_000;
const CACHE_MAX_ENTRIES = 50;

type CacheEntry = { results: PlaceSearchResult[]; ts: number };
const searchCache = new Map<string, CacheEntry>();

function cacheKey(query: string, proximity?: string): string {
  const q = query.trim().toLowerCase().slice(0, 100);
  const p = proximity ?? "";
  return `${q}|${p}`;
}

function getCached(key: string): PlaceSearchResult[] | null {
  const entry = searchCache.get(key);
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.results;
}

function setCache(key: string, results: PlaceSearchResult[]) {
  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) searchCache.delete(oldest[0]);
  }
  searchCache.set(key, { results, ts: Date.now() });
}

export type ReverseGeocodeResult = {
  primary: string;
  secondary: string;
  fullAddress: string;
};

/**
 * Reverse geocode lng,lat to address using Mapbox Geocoding API.
 * Returns primary (e.g. locality/place name) and secondary (e.g. area, city).
 */
export async function reverseGeocode(
  longitude: number,
  latitude: number
): Promise<ReverseGeocodeResult> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) {
    return {
      primary: "Current location",
      secondary: "Enable location or add MAPBOX token",
      fullAddress: "Location not available",
    };
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${encodeURIComponent(mapboxAccessToken)}&limit=1&types=address,place,locality,neighborhood&language=en`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Mapbox geocode failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    features?: Array<{
      place_name?: string;
      text?: string;
      context?: Array<{ id: string; text: string }>;
    }>;
  };

  const feature = data.features?.[0];
  if (!feature) {
    return {
      primary: "Current location",
      secondary: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      fullAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
    };
  }

  const placeName = feature.place_name ?? "";
  const context = feature.context ?? [];
  const locality = context.find((c) => c.id.startsWith("locality"))?.text;
  const place = context.find((c) => c.id.startsWith("place"))?.text;
  const neighborhood = context.find((c) => c.id.startsWith("neighborhood"))?.text;
  const primary = feature.text ?? locality ?? neighborhood ?? place ?? "Current location";
  const secondary = [locality, place, neighborhood].filter(Boolean).join(", ") || placeName.split(",").slice(1, 3).join(", ").trim() || "—";

  return {
    primary,
    secondary: secondary.slice(0, 80),
    fullAddress: placeName,
  };
}

export type PlaceSearchResult = ReverseGeocodeResult & {
  latitude: number;
  longitude: number;
};

function parseMapboxFeatures(
  features: Array<{
    place_name?: string;
    text?: string;
    center?: [number, number];
    context?: Array<{ id: string; text: string }>;
    place_type?: string[];
  }>
): PlaceSearchResult[] {
  const parsed: (PlaceSearchResult & { _addr?: boolean })[] = features.map((feature) => {
    const placeName = feature.place_name ?? "";
    const [longitude, latitude] = feature.center ?? [0, 0];
    const context = feature.context ?? [];
    const locality = context.find((c) => c.id.startsWith("locality"))?.text;
    const place = context.find((c) => c.id.startsWith("place"))?.text;
    const neighborhood = context.find((c) => c.id.startsWith("neighborhood"))?.text;
    const primary = feature.text ?? locality ?? neighborhood ?? place ?? placeName.split(",")[0] ?? "Address";
    const secondary = [locality, place, neighborhood].filter(Boolean).join(", ") || placeName.split(",").slice(1, 3).join(", ").trim() || "—";
    const isAddress = feature.place_type?.includes("address") ?? false;
    return {
      primary,
      secondary: secondary.slice(0, 80),
      fullAddress: placeName,
      latitude,
      longitude,
      _addr: isAddress,
    };
  });
  parsed.sort((a, b) => (b._addr ? 1 : 0) - (a._addr ? 1 : 0));
  return parsed.map(({ _addr, ...r }) => r);
}

/** Options for search calls: optional abort signal and proximity for server-side biasing. */
export type SearchOptions = {
  signal?: AbortSignal;
  /** When set, results are biased toward this point (lng, lat). */
  proximity?: { longitude: number; latitude: number };
};

/**
 * Forward geocode: search places/addresses by text using Mapbox Geocoding API.
 * Street-level accuracy: address type first, autocomplete for real-time partial match.
 * Uses a short-lived cache for identical queries.
 */
export async function searchPlaces(
  query: string,
  options?: SearchOptions
): Promise<PlaceSearchResult[]> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) return [];

  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const proximityStr = options?.proximity
    ? `${options.proximity.longitude},${options.proximity.latitude}`
    : "";
  const key = cacheKey(trimmed, proximityStr);
  const cached = getCached(key);
  if (cached) return cached;

  const encodedQuery = encodeURIComponent(trimmed);
  const params = new URLSearchParams({
    access_token: mapboxAccessToken,
    limit: "10",
    country: COUNTRY_INDIA,
    types: "address,place,locality,neighborhood,poi",
    autocomplete: "true",
    language: "en",
  });
  if (proximityStr) params.set("proximity", proximityStr);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?${params.toString()}`;

  const res = await fetch(url, { signal: options?.signal });
  if (!res.ok || options?.signal?.aborted) return [];
  const data = (await res.json()) as {
    features?: Array<{
      place_name?: string;
      text?: string;
      center?: [number, number];
      context?: Array<{ id: string; text: string }>;
      place_type?: string[];
    }>;
  };
  const results = parseMapboxFeatures(data.features ?? []);
  setCache(key, results);
  return results;
}

/**
 * Search places biased toward a location (proximity). India-only.
 * Street-level + autocomplete; use for pickup/drop suggestions in real time.
 */
export async function searchPlacesWithProximity(
  query: string,
  longitude: number,
  latitude: number,
  options?: { signal?: AbortSignal }
): Promise<PlaceSearchResult[]> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) return [];

  const trimmed = query.trim();
  const searchTerm = trimmed.length >= 2 ? trimmed : "place";
  const proximityStr = `${longitude},${latitude}`;
  const key = cacheKey(searchTerm, proximityStr);
  const cached = getCached(key);
  if (cached) return cached;

  const encodedQuery = encodeURIComponent(searchTerm);
  const params = new URLSearchParams({
    access_token: mapboxAccessToken,
    limit: "10",
    country: COUNTRY_INDIA,
    proximity: proximityStr,
    types: "address,place,locality,neighborhood,poi",
    autocomplete: "true",
    language: "en",
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?${params.toString()}`;

  const res = await fetch(url, { signal: options?.signal });
  if (!res.ok || options?.signal?.aborted) return [];
  const data = (await res.json()) as {
    features?: Array<{
      place_name?: string;
      text?: string;
      center?: [number, number];
      context?: Array<{ id: string; text: string }>;
      place_type?: string[];
    }>;
  };
  const results = parseMapboxFeatures(data.features ?? []);
  setCache(key, results);
  return results;
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
 * Street-level + autocomplete; proximity keeps results in same city/area.
 */
export async function searchDropSuggestionsInCity(
  query: string,
  pickupLongitude: number,
  pickupLatitude: number,
  options?: { signal?: AbortSignal }
): Promise<PlaceSearchResult[]> {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken) return [];

  const trimmed = query.trim();
  const searchTerm = trimmed.length >= 2 ? trimmed : "landmark";
  const proximityStr = `${pickupLongitude},${pickupLatitude}`;
  const key = cacheKey(`drop:${searchTerm}`, proximityStr);
  const cached = getCached(key);
  if (cached) return cached;

  const encodedQuery = encodeURIComponent(searchTerm);
  const params = new URLSearchParams({
    access_token: mapboxAccessToken,
    limit: "10",
    country: COUNTRY_INDIA,
    proximity: proximityStr,
    types: "address,poi,place,locality",
    autocomplete: "true",
    language: "en",
  });
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?${params.toString()}`;

  const res = await fetch(url, { signal: options?.signal });
  if (!res.ok || options?.signal?.aborted) return [];
  const data = (await res.json()) as {
    features?: Array<{
      place_name?: string;
      text?: string;
      center?: [number, number];
      context?: Array<{ id: string; text: string }>;
      place_type?: string[];
    }>;
  };
  const results = parseMapboxFeatures(data.features ?? []);
  setCache(key, results);
  return results;
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
