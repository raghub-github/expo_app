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

export const MAPBOX_SEARCH_DEBOUNCE_MS = 250;
export const MAPBOX_SEARCH_MIN_CHARS = 2;
const RETRIEVE_TIMEOUT_MS = 4_000;

/**
 * Search Box also suggests whole categories and chains ("Hospital", "McDonalds"). These
 * are not places: retrieving one returns ten unrelated features, and the old code pinned
 * the delivery location to whichever came first.
 */
const NON_PLACE_FEATURE_TYPES = new Set(["category", "brand"]);

/**
 * An abort signal that fires on `outer` or after `ms`. Call `done` when finished.
 * (AbortSignal.any / AbortSignal.timeout do not exist in React Native.)
 */
export function signalWithDeadline(
  outer: AbortSignal | undefined,
  ms: number
): { signal: AbortSignal; done: () => void; abort: () => void } {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (outer?.aborted) controller.abort();
  outer?.addEventListener("abort", onAbort);
  const timer = setTimeout(onAbort, ms);
  return {
    signal: controller.signal,
    abort: onAbort,
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener("abort", onAbort);
    },
  };
}

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

function scoreName(rawName: string, rawFull: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0.7;
  const name = rawName.toLowerCase();
  if (name === q) return 1;
  if (name.startsWith(`${q} `)) return 0.98;
  const words = name.split(/\s+/);
  if (words[0] === q || words.some((w) => w === q)) return 0.95;
  if (words.length === 1 && words[0]!.startsWith(q) && words[0]!.length > q.length + 1) return 0.35;
  if (name.includes(q)) return 0.75;
  if (rawFull.toLowerCase().includes(q)) return 0.5;
  return 0.4;
}

function scoreSuggestion(s: SearchBoxSuggestion, query: string): number {
  return scoreName(s.name_preferred || s.name || "", s.full_address || s.place_formatted || "", query);
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
  return (response.suggestions ?? [])
    .filter((s) => !NON_PLACE_FEATURE_TYPES.has(s.feature_type))
    .map((s) => suggestionToEnrichedPreview(s, trimmed));
}

type V6ForwardFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    name_preferred?: string;
    full_address?: string;
    place_formatted?: string;
    feature_type?: string;
    context?: Record<string, { name?: string } | undefined>;
  };
};

/**
 * Geocoding v6 forward: the second search source, run alongside Search Box.
 *
 * They cover different ground. For "boring road" (Patna) Search Box returned ten POIs and
 * not the road itself; v6 returned the road. For "patna junction" it is the reverse. v6
 * answers faster, and each hit carries coordinates, so picking one needs no retrieve call.
 */
export async function mapboxGeocodeForward(
  query: string,
  options?: {
    signal?: AbortSignal;
    proximity?: { longitude: number; latitude: number };
    limit?: number;
    types?: string;
    autocomplete?: boolean;
  }
): Promise<EnrichedPlaceResult[]> {
  const trimmed = query.trim();
  const { mapboxAccessToken } = getConfig();
  if (!mapboxAccessToken?.trim() || trimmed.length < MAPBOX_SEARCH_MIN_CHARS) return [];

  const params = [
    `q=${encodeURIComponent(trimmed)}`,
    `access_token=${encodeURIComponent(mapboxAccessToken)}`,
    `country=in`,
    `language=en`,
    `worldview=in`,
    `limit=${options?.limit ?? 8}`,
    `autocomplete=${options?.autocomplete === false ? "false" : "true"}`,
  ];
  if (options?.proximity) {
    params.push(`proximity=${options.proximity.longitude},${options.proximity.latitude}`);
  }
  if (options?.types) params.push(`types=${encodeURIComponent(options.types)}`);

  const res = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.join("&")}`, {
    signal: options?.signal,
  });
  if (!res.ok) throw new Error(`Mapbox forward failed: ${res.status}`);
  const data = (await res.json()) as { features?: V6ForwardFeature[] };

  const results: EnrichedPlaceResult[] = [];
  for (const f of data.features ?? []) {
    const props = f.properties;
    const coords = f.geometry?.coordinates;
    const longitude = coords?.[0];
    const latitude = coords?.[1];
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;
    if (!isValidMapCoordinate(latitude, longitude)) continue;
    const primary = props?.name_preferred || props?.name;
    if (!primary) continue;
    const secondary = props?.place_formatted ?? "";
    const fullAddress = props?.full_address?.trim() || [primary, secondary].filter(Boolean).join(", ");
    const ctx = props?.context;
    results.push({
      primary,
      secondary: secondary.slice(0, 120),
      fullAddress,
      latitude,
      longitude,
      area: ctx?.neighborhood?.name ?? ctx?.locality?.name,
      city: ctx?.place?.name ?? ctx?.district?.name,
      state: ctx?.region?.name,
      pincode: ctx?.postcode?.name,
      confidenceScore: scoreName(primary, fullAddress, trimmed),
      matchText: primary,
      source: "mapbox",
      pendingRetrieve: false,
      featureType: props?.feature_type,
    });
  }
  return results;
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

/**
 * Resolve a tapped result to exact coordinates. Tries Search Box retrieve (twice: a tap
 * deserves more than one chance on a flaky network), then geocodes the result's own text.
 * Never rejects: if everything fails it returns `place` still without coordinates, and
 * callers tell the user. A rejected retrieve used to make the tap silently do nothing.
 */
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
    for (let attempt = 0; attempt < 2 && !signal?.aborted; attempt++) {
      const deadline = signalWithDeadline(signal, RETRIEVE_TIMEOUT_MS);
      try {
        const retrieved = await mapboxSearchRetrieve(place.mapboxSuggestion, context, deadline.signal);
        if (retrieved && isValidMapCoordinate(retrieved.latitude, retrieved.longitude)) {
          return retrieved;
        }
        break; // Answered, but no usable coordinates: retrying will not change that.
      } catch {
        // Network or timeout: try again.
      } finally {
        deadline.done();
      }
    }
  }
  if (!signal?.aborted) {
    const deadline = signalWithDeadline(signal, RETRIEVE_TIMEOUT_MS);
    try {
      const [hit] = await mapboxGeocodeForward(place.fullAddress || place.primary, {
        signal: deadline.signal,
        limit: 1,
        autocomplete: false,
      });
      if (hit) {
        return {
          ...place,
          latitude: hit.latitude,
          longitude: hit.longitude,
          pendingRetrieve: false,
        };
      }
    } catch {
      // fall through: caller reports it
    } finally {
      deadline.done();
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
