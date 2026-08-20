/**
 * Mapbox Search Box API (@mapbox/search-js-core) — suggest / retrieve / reverse.
 * Replaces legacy Geocoding API v5 for forward search across the Customer App.
 */

import {
  SearchBoxCore,
  SessionToken,
  polyfillFetch,
  type SearchBoxSuggestion,
  type SearchBoxFeatureSuggestion,
} from "@mapbox/search-js-core";
import { getConfig } from "@/config/env";
import { isValidMapCoordinate } from "@/lib/map-coordinates";
import { type EnrichedPlaceResult } from "@/services/locationSearch.service";

export const MAPBOX_SEARCH_DEBOUNCE_MS = 400;
export const MAPBOX_SEARCH_MIN_CHARS = 2;

/** Context keys — one session token per active search field. */
export type MapboxSearchSessionContext =
  | "ride-pickup"
  | "ride-drop"
  | "ride-stop"
  | "food-delivery"
  | "add-address"
  | "location-picker"
  | "checkout"
  | "parcel-pickup"
  | "parcel-drop";

let fetchPolyfilled = false;
let searchBoxCore: SearchBoxCore | null = null;
const sessionTokens = new Map<MapboxSearchSessionContext, SessionToken>();

/** India-optimized Search Box defaults (POI + address + places). */
const SEARCH_BOX_DEFAULTS = {
  country: "IN",
  language: "en",
  limit: 10,
  navigation_profile: "driving" as const,
};

export function ensureMapboxSearchReady(): void {
  if (fetchPolyfilled) return;
  if (typeof globalThis.fetch === "function" && typeof globalThis.AbortController === "function") {
    polyfillFetch({
      fetch: globalThis.fetch.bind(globalThis),
      AbortController: globalThis.AbortController,
    });
  }
  fetchPolyfilled = true;
}

function getSearchBoxCore(): SearchBoxCore | null {
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken?.trim()) return null;
  ensureMapboxSearchReady();
  if (!searchBoxCore) {
    searchBoxCore = new SearchBoxCore({
      accessToken: mapboxAccessToken,
      ...SEARCH_BOX_DEFAULTS,
    });
  }
  return searchBoxCore;
}

export function getMapboxSearchSessionToken(context: MapboxSearchSessionContext): SessionToken {
  let token = sessionTokens.get(context);
  if (!token) {
    token = new SessionToken();
    sessionTokens.set(context, token);
  }
  return token;
}

/** Reset session after user selects a location (Search Box billing + relevance). */
export function resetMapboxSearchSession(context: MapboxSearchSessionContext): void {
  sessionTokens.set(context, new SessionToken());
}

export type MapboxSuggestOptions = {
  signal?: AbortSignal;
  proximity?: { longitude: number; latitude: number };
  sessionContext?: MapboxSearchSessionContext;
  limit?: number;
};

function proximityLngLat(proximity?: { longitude: number; latitude: number }) {
  if (!proximity) return undefined;
  return { lng: proximity.longitude, lat: proximity.latitude };
}

function scoreSuggestion(s: SearchBoxSuggestion, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0.7;
  const name = (s.name_preferred || s.name || "").toLowerCase();
  if (name === q) return 1;
  if (name.startsWith(`${q} `)) return 0.98;
  const words = name.split(/\s+/);
  if (words[0] === q || words.some((w) => w === q)) return 0.95;
  if (words.length === 1 && words[0]!.startsWith(q) && words[0]!.length > q.length + 1) return 0.35;
  if (name.includes(q)) return 0.75;
  const full = (s.full_address || s.place_formatted || "").toLowerCase();
  if (full.includes(q)) return 0.5;
  return 0.4;
}

function contextField(
  ctx: SearchBoxSuggestion["context"],
  key: keyof NonNullable<SearchBoxSuggestion["context"]>
): string | undefined {
  const entry = ctx?.[key];
  return entry && typeof entry === "object" && "name" in entry ? entry.name : undefined;
}

export function suggestionToEnrichedPreview(
  suggestion: SearchBoxSuggestion,
  query: string
): EnrichedPlaceResult {
  const primary = suggestion.name_preferred || suggestion.name || "Location";
  const secondary = suggestion.place_formatted || suggestion.address || "—";
  const fullAddress =
    suggestion.full_address?.trim() ||
    [primary, suggestion.address, suggestion.place_formatted].filter(Boolean).join(", ");

  const geom = suggestion._geometry?.coordinates;
  const longitude = geom?.[0] ?? 0;
  const latitude = geom?.[1] ?? 0;
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0);

  return {
    primary,
    secondary: secondary.slice(0, 120),
    fullAddress,
    latitude: hasCoords ? latitude : 0,
    longitude: hasCoords ? longitude : 0,
    area: contextField(suggestion.context, "locality") ?? contextField(suggestion.context, "neighborhood"),
    city: contextField(suggestion.context, "place") ?? contextField(suggestion.context, "district"),
    state: contextField(suggestion.context, "region"),
    pincode: contextField(suggestion.context, "postcode"),
    distanceKm: suggestion.distance != null ? suggestion.distance / 1000 : undefined,
    confidenceScore: scoreSuggestion(suggestion, query),
    matchText: primary,
    source: "mapbox",
    mapboxSuggestion: suggestion,
    pendingRetrieve: !hasCoords,
    featureType: suggestion.feature_type,
  };
}

function featureToEnriched(feature: SearchBoxFeatureSuggestion): EnrichedPlaceResult {
  const props = feature.properties;
  const coords = props.coordinates;
  const primary = props.name_preferred || props.name || "Location";
  const secondary = props.place_formatted || props.address || "—";
  const fullAddress =
    props.full_address?.trim() ||
    [primary, props.address, props.place_formatted].filter(Boolean).join(", ");

  return {
    primary,
    secondary: secondary.slice(0, 120),
    fullAddress,
    latitude: coords.latitude,
    longitude: coords.longitude,
    area: contextField(props.context, "locality") ?? contextField(props.context, "neighborhood"),
    city: contextField(props.context, "place") ?? contextField(props.context, "district"),
    state: contextField(props.context, "region"),
    pincode: contextField(props.context, "postcode"),
    confidenceScore: 1,
    matchText: primary,
    source: "mapbox",
    pendingRetrieve: false,
    featureType: props.feature_type,
  };
}

/**
 * Search Box suggest — instant POI / address / locality suggestions (India-only).
 */
export async function mapboxSearchSuggest(
  query: string,
  options?: MapboxSuggestOptions
): Promise<EnrichedPlaceResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < MAPBOX_SEARCH_MIN_CHARS) return [];

  const core = getSearchBoxCore();
  if (!core) return [];

  const context = options?.sessionContext ?? "location-picker";
  const sessionToken = getMapboxSearchSessionToken(context);
  const proximity = proximityLngLat(options?.proximity);

  const response = await core.suggest(trimmed, {
    sessionToken,
    signal: options?.signal,
    country: SEARCH_BOX_DEFAULTS.country,
    language: SEARCH_BOX_DEFAULTS.language,
    limit: options?.limit ?? SEARCH_BOX_DEFAULTS.limit,
    proximity,
    origin: proximity,
    navigation_profile: SEARCH_BOX_DEFAULTS.navigation_profile,
    // Omit `types` — include POIs (railway, airport, landmarks) like Rapido.
  });

  if (options?.signal?.aborted) return [];
  const mapped = (response.suggestions ?? []).map((s) => suggestionToEnrichedPreview(s, trimmed));
  return mapped;
}

/**
 * Retrieve coordinates for a suggestion (part 2 of Search Box flow).
 */
export async function mapboxSearchRetrieve(
  suggestion: SearchBoxSuggestion,
  context: MapboxSearchSessionContext,
  signal?: AbortSignal
): Promise<EnrichedPlaceResult | null> {
  const core = getSearchBoxCore();
  if (!core) return null;

  const sessionToken = getMapboxSearchSessionToken(context);
  const response = await core.retrieve(suggestion, { sessionToken, signal });
  const feature = response.features?.[0];
  if (!feature) return null;

  resetMapboxSearchSession(context);
  return featureToEnriched(feature);
}

/** Resolve enriched result — retrieves when coords are pending or missing. */
export async function resolveMapboxEnrichedPlace(
  place: EnrichedPlaceResult,
  context: MapboxSearchSessionContext,
  signal?: AbortSignal
): Promise<EnrichedPlaceResult> {
  if (isValidMapCoordinate(place.latitude, place.longitude) && !place.pendingRetrieve) {
    resetMapboxSearchSession(context);
    return place;
  }
  if (place.mapboxSuggestion) {
    const retrieved = await mapboxSearchRetrieve(place.mapboxSuggestion, context, signal);
    if (retrieved && isValidMapCoordinate(retrieved.latitude, retrieved.longitude)) {
      return retrieved;
    }
  }
  return place;
}

export type MapboxReverseResult = {
  primary: string;
  secondary: string;
  fullAddress: string;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  latitude: number;
  longitude: number;
};

/** Search Box reverse geocoding (map pin → address). */
export async function mapboxSearchReverse(
  longitude: number,
  latitude: number,
  signal?: AbortSignal
): Promise<MapboxReverseResult | null> {
  const core = getSearchBoxCore();
  if (!core) return null;

  const response = await core.reverse(
    { lng: longitude, lat: latitude },
    {
      signal,
      country: SEARCH_BOX_DEFAULTS.country,
      language: SEARCH_BOX_DEFAULTS.language,
      limit: 1,
      types: "address,place,locality,neighborhood,street,poi",
    }
  );

  const feature = response.features?.[0];
  if (!feature) return null;

  const enriched = featureToEnriched(feature);
  return {
    primary: enriched.primary,
    secondary: enriched.secondary,
    fullAddress: enriched.fullAddress,
    city: enriched.city ?? null,
    state: enriched.state ?? null,
    pincode: enriched.pincode ?? null,
    latitude: enriched.latitude,
    longitude: enriched.longitude,
  };
}

export type { SearchBoxSuggestion };
