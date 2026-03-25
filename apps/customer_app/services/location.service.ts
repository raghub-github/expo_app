/**
 * Location service - reverse geocode and forward search using Mapbox Geocoding API.
 * All search results are restricted to India (country=IN).
 * Forward search delegates to the intelligent location search engine (locationSearch.service).
 */

import { getConfig } from "@/config/env";
import {
  searchLocations,
  toLegacyPlaceResult,
  isPincodeSearchMode,
  type EnrichedPlaceResult,
  type LocationSearchOptions,
} from "@/services/locationSearch.service";

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
      city: null,
      state: null,
      pincode: null,
    };
  }

  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${encodeURIComponent(mapboxAccessToken)}&limit=1&types=address,place,locality,neighborhood,postcode&language=en,hi&worldview=in`;
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
      city: null,
      state: null,
      pincode: null,
    };
  }

  const placeName = feature.place_name ?? "";
  const context = feature.context ?? [];
  const locality = context.find((c) => c.id.startsWith("locality"))?.text;
  const place = context.find((c) => c.id.startsWith("place"))?.text;
  const neighborhood = context.find((c) => c.id.startsWith("neighborhood"))?.text;
  const region = context.find((c) => c.id.startsWith("region"))?.text;
  const postcode = context.find((c) => c.id.startsWith("postcode"))?.text;
  const fallbackPincode = placeName.match(/\b\d{6}\b/)?.[0] ?? null;
  const primary = feature.text ?? locality ?? neighborhood ?? place ?? "Current location";
  const secondary = [locality, place, neighborhood].filter(Boolean).join(", ") || placeName.split(",").slice(1, 3).join(", ").trim() || "—";

  return {
    primary,
    secondary: secondary.slice(0, 80),
    fullAddress: placeName,
    city: place ?? locality ?? null,
    state: region ?? null,
    pincode: postcode ?? fallbackPincode,
  };
}

export type PlaceSearchResult = ReverseGeocodeResult & {
  latitude: number;
  longitude: number;
};

/** Re-export enriched type and pincode detection for location picker UI. */
export type { EnrichedPlaceResult } from "@/services/locationSearch.service";
export { isPincodeSearchMode } from "@/services/locationSearch.service";

/** Options for search calls: optional abort signal, proximity, and local fallback. */
export type SearchOptions = {
  signal?: AbortSignal;
  proximity?: { longitude: number; latitude: number };
  recentLocationKeys?: Set<string>;
  getLocalSuggestions?: (q: string) => Promise<import("@/services/locationSearch.service").LocalSuggestionInput[]>;
  getCityAreas?: (cityName: string) => Promise<import("@/services/locationSearch.service").LocalSuggestionInput[]>;
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
  const searchTerm = query.trim().length >= 2 ? query.trim() : "place";
  const enriched = await searchLocations(searchTerm, {
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
  options?: { signal?: AbortSignal; recentLocationKeys?: Set<string> }
): Promise<PlaceSearchResult[]> {
  const searchTerm = query.trim().length >= 2 ? query.trim() : "landmark";
  const enriched = await searchLocations(searchTerm, {
    signal: options?.signal,
    proximity: { longitude: pickupLongitude, latitude: pickupLatitude },
    recentLocationKeys: options?.recentLocationKeys,
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
