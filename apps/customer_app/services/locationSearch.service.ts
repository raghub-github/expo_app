/**
 * GatiMitra Location Search Engine – Zomato/Swiggy-level coverage.
 * Multi-layer: Mapbox → local DB fallback → fuzzy → India keyword boost → city→areas.
 */

import { getConfig } from "@/config/env";

const COUNTRY_INDIA = "IN";
const CACHE_TTL_MS = 30_000;
const CACHE_MAX_ENTRIES = 50;
const MAPBOX_CONFIDENCE_THRESHOLD = 0.45;

/** Rule 1: 6-digit numeric input → PINCODE_SEARCH_MODE (exact match only, no fuzzy). */
const PINCODE_REGEX = /^[0-9]{6}$/;

export function isPincodeSearchMode(input: string): boolean {
  return PINCODE_REGEX.test(input.trim());
}

/** Common Indian locality typos → canonical (fuzzy normalization). */
const TYPO_NORMALIZE: Record<string, string> = {
  nawda: "nawada",
  kankarbag: "kankarbagh",
  "rajendr nagr": "rajendra nagar",
  "rajendra nagr": "rajendra nagar",
  patliputra: "patliputra colony",
  danapur: "danapur",
};

/** India locality keywords – never ignore; boost when present. */
const INDIA_LOCALITY_KEYWORDS = [
  "nagar", "colony", "tola", "chowk", "bazar", "bazaar", "mandir", "road", "lane",
  "ward", "block", "sector", "phase", "extension", "extn", "near", "opp", "behind",
];
// ——— LRU cache for search results (by query + proximity) ———
type CacheEntry = { results: EnrichedPlaceResult[]; ts: number };
const searchCache = new Map<string, CacheEntry>();

function cacheKey(query: string, proximity?: string): string {
  const q = query.trim().toLowerCase().slice(0, 120);
  const p = proximity ?? "";
  return `${q}|${p}`;
}

function getCached(key: string): EnrichedPlaceResult[] | null {
  const entry = searchCache.get(key);
  if (!entry || Date.now() - entry.ts > CACHE_TTL_MS) return null;
  return entry.results;
}

function setCache(key: string, results: EnrichedPlaceResult[]) {
  if (searchCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = [...searchCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    if (oldest) searchCache.delete(oldest[0]);
  }
  searchCache.set(key, { results, ts: Date.now() });
}

export function locationKey(lat: number, lng: number, primary: string): string {
  const rlat = Math.round(lat * 1000) / 1000;
  const rlng = Math.round(lng * 1000) / 1000;
  return `${rlat},${rlng},${(primary ?? "").slice(0, 40)}`;
}

// ——— Enriched result type (backward compatible with PlaceSearchResult) ———
export type EnrichedPlaceResult = {
  primary: string;
  secondary: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  /** Area / locality / neighborhood */
  area?: string;
  /** City / place */
  city?: string;
  /** State / region */
  state?: string;
  /** Pincode / postcode */
  pincode?: string;
  /** Distance from user in km (when proximity provided) */
  distanceKm?: number;
  /** 0–1 confidence for ranking / auto-select */
  confidenceScore?: number;
  /** Text that matched the query (for highlight in UI) */
  matchText?: string;
  /** Source for ranking: mapbox vs local fallback */
  source?: "mapbox" | "local";
  usageCount?: number;
  /** True when result is from pincode-only search (exact match); use for 3-line display. */
  isPincodeResult?: boolean;
};

/** Local suggestion from backend (popular_locations / saved addresses). */
export type LocalSuggestionInput = {
  primary: string;
  secondary: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
  source: "popular" | "saved_address";
  usageCount?: number;
  city?: string;
  area?: string;
};

// ——— Mapbox feature type (v5) ———
type MapboxFeature = {
  place_name?: string;
  text?: string;
  matching_text?: string;
  center?: [number, number];
  context?: Array<{ id: string; text: string }>;
  place_type?: string[];
  relevance?: number;
};

const ADMIN_PRIORITY: Record<string, number> = {
  address: 1,
  poi: 0.92,
  neighborhood: 0.9,
  locality: 0.85,
  place: 0.75,
  district: 0.65,
  postcode: 0.5,
  region: 0.45,
  country: 0.3,
};

function parseContext(context: MapboxFeature["context"]) {
  const ctx = context ?? [];
  const locality = ctx.find((c) => c.id.startsWith("locality"))?.text;
  const place = ctx.find((c) => c.id.startsWith("place"))?.text;
  const neighborhood = ctx.find((c) => c.id.startsWith("neighborhood"))?.text;
  const region = ctx.find((c) => c.id.startsWith("region"))?.text;
  const postcode = ctx.find((c) => c.id.startsWith("postcode"))?.text;
  const district = ctx.find((c) => c.id.startsWith("district"))?.text;
  return {
    locality,
    place,
    neighborhood,
    region,
    postcode,
    district,
    area: neighborhood ?? locality ?? district,
    city: place ?? locality,
    state: region,
    pincode: postcode,
  };
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Proximity score 0–1: closer = higher. Uses inverse distance. */
function proximityScore(
  lat: number,
  lng: number,
  userLat: number,
  userLng: number
): number {
  const km = haversineKm(userLat, userLng, lat, lng);
  if (km <= 0) return 1;
  // 50km => ~0.5, 200km => ~0.2
  return Math.max(0, 1 - km / 100);
}

function parseAndEnrich(
  features: MapboxFeature[],
  userCoords: { latitude: number; longitude: number } | undefined,
  _query: string,
  recentLocationKeys?: Set<string>
): EnrichedPlaceResult[] {
  const recentKeys = recentLocationKeys ?? new Set<string>();
  const userLat = userCoords?.latitude;
  const userLng = userCoords?.longitude;

  const enriched: EnrichedPlaceResult[] = features.map((f) => {
    const [longitude, latitude] = f.center ?? [0, 0];
    const ctx = parseContext(f.context);
    const placeName = f.place_name ?? "";
    const primary =
      f.text ?? ctx.locality ?? ctx.neighborhood ?? ctx.place ?? placeName.split(",")[0] ?? "Address";
    const secondary =
      [ctx.locality, ctx.place, ctx.neighborhood].filter(Boolean).join(", ") ||
      placeName.split(",").slice(1, 3).join(", ").trim() ||
      "—";

    const distanceKm =
      userLat != null && userLng != null
        ? haversineKm(userLat, userLng, latitude, longitude)
        : undefined;

    const relevance = typeof f.relevance === "number" ? f.relevance : 0.7;
    const placeTypes = f.place_type ?? [];
    const adminScore =
      Math.max(0, ...placeTypes.map((t) => ADMIN_PRIORITY[t] ?? 0.5)) || 0.5;

    const proximity =
      userLat != null && userLng != null
        ? proximityScore(latitude, longitude, userLat, userLng)
        : 0.5;

    const histKey = locationKey(latitude, longitude, primary);
    const userHistoryBoost = recentKeys.has(histKey) ? 0.1 : 0;
    const indiaBoost = indiaKeywordBoost(placeName + " " + primary);

    // Delivery-platform scoring: relevance×0.4 + proximity×0.2 + usage(0) + keyword/exact×0.2 + history
    const finalScore =
      relevance * 0.4 +
      proximity * 0.2 +
      adminScore * 0.1 +
      indiaBoost +
      (0.1 + userHistoryBoost);

    return {
      primary,
      secondary: secondary.slice(0, 80),
      fullAddress: placeName,
      latitude,
      longitude,
      area: ctx.area ?? undefined,
      city: ctx.city ?? undefined,
      state: ctx.state ?? undefined,
      pincode: ctx.pincode ?? undefined,
      distanceKm,
      confidenceScore: Math.min(1, finalScore),
      matchText: f.matching_text ?? f.text ?? primary,
      source: "mapbox" as const,
    };
  });

  // Sort: when user coords available, nearest distance first (ascending); else by confidence
  const hasProximity = userLat != null && userLng != null;
  enriched.sort((a, b) => {
    if (hasProximity) {
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      if (da !== db) return da - db; // ascending: nearest first
    }
    return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
  });
  return enriched;
}

/** Build Mapbox forward geocoding URL – delivery-platform params (types=place,locality,neighborhood,address,poi). */
function buildMapboxUrl(
  encodedQuery: string,
  params: {
    token: string;
    proximity?: string;
    types?: string;
    limit?: number;
    language?: string;
  }
): string {
  const p = new URLSearchParams({
    access_token: params.token,
    limit: String(params.limit ?? 10),
    country: COUNTRY_INDIA,
    types: params.types ?? "place,locality,neighborhood,address,poi",
    autocomplete: "true",
    fuzzyMatch: "true",
    language: params.language ?? "en",
    worldview: "in",
  });
  if (params.proximity) p.set("proximity", params.proximity);
  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedQuery}.json?${p.toString()}`;
}

/** Rule 2 & 5: Pincode-only URL – exact match, NO fuzzy, NO proximity, NO autocomplete. */
function buildMapboxPincodeUrl(encodedPincode: string, token: string): string {
  const p = new URLSearchParams({
    access_token: token,
    limit: "10",
    country: COUNTRY_INDIA,
    types: "postcode",
    autocomplete: "false",
    fuzzyMatch: "false",
    language: "en",
    worldview: "in",
  });
  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedPincode}.json?${p.toString()}`;
}

/** Rule 2: Exact pincode only – filter to features where postcode exactly equals entered. */
function fetchMapboxPincodeExact(
  pincode: string,
  signal: AbortSignal | undefined,
  token: string
): Promise<MapboxFeature[]> {
  const encoded = encodeURIComponent(pincode);
  const url = buildMapboxPincodeUrl(encoded, token);
  return fetch(url, { signal })
    .then((res) => (res.ok ? res.json() : { features: [] }))
    .then((data: { features?: MapboxFeature[] }) => {
      const features = data.features ?? [];
      const exact = pincode.trim();
      return features.filter((f) => {
        const ctx = parseContext(f.context);
        const postcodeText = (ctx.pincode ?? f.text ?? "").trim();
        return postcodeText === exact;
      });
    })
    .catch(() => []);
}

/** Rule 3: Format for pincode suggestions – "Area Name, City" / "Pincode: XXXXX" / State. */
function parsePincodeResults(
  features: MapboxFeature[],
  enteredPincode: string
): EnrichedPlaceResult[] {
  return features.map((f) => {
    const [longitude, latitude] = f.center ?? [0, 0];
    const ctx = parseContext(f.context);
    const area = ctx.area ?? ctx.neighborhood ?? ctx.locality;
    const city = ctx.place ?? ctx.locality;
    const state = ctx.state ?? "";
    const pincodeText = ctx.pincode ?? f.text ?? enteredPincode;

    const primary = [area, city].filter(Boolean).join(", ") || city || pincodeText || "Pincode";
    const secondary = `Pincode: ${pincodeText}`;
    const fullAddress = state ? `${primary}, ${pincodeText}, ${state}` : `${primary}, ${pincodeText}`;

    return {
      primary,
      secondary,
      fullAddress,
      latitude,
      longitude,
      area: area ?? undefined,
      city: city ?? undefined,
      state: state || undefined,
      pincode: pincodeText || undefined,
      confidenceScore: 1,
      matchText: pincodeText,
      source: "mapbox",
      isPincodeResult: true,
    };
  });
}

/** Normalize query for typo tolerance (e.g. nawda → nawada). */
function normalizeQueryForFuzzy(q: string): string {
  const lower = q.trim().toLowerCase();
  for (const [typo, canonical] of Object.entries(TYPO_NORMALIZE)) {
    if (lower.includes(typo)) return lower.replace(new RegExp(typo, "gi"), canonical);
  }
  return lower;
}

/** India locality keyword boost: 0–0.2 added to score when text contains nagar, colony, etc. */
function indiaKeywordBoost(text: string): number {
  const lower = (text ?? "").toLowerCase();
  for (const kw of INDIA_LOCALITY_KEYWORDS) {
    if (lower.includes(kw)) return 0.2;
  }
  return 0;
}

/** Fetch Mapbox forward geocode. Primary: place,locality,neighborhood,address,poi; then fallbacks. */
async function fetchMapboxForward(
  query: string,
  proximityStr: string | undefined,
  signal: AbortSignal | undefined,
  token: string
): Promise<MapboxFeature[]> {
  const encodedQuery = encodeURIComponent(query);
  const typesAttempts: string[] = [
    "place,locality,neighborhood,address,poi",
    "place,locality,neighborhood,address,district,region",
    "place,locality,neighborhood,address,district,region,postcode",
  ];

  for (let i = 0; i < typesAttempts.length; i++) {
    const url = buildMapboxUrl(encodedQuery, {
      token,
      proximity: proximityStr,
      types: typesAttempts[i],
      limit: 10,
      language: "en",
    });
    const res = await fetch(url, { signal });
    if (signal?.aborted) return [];
    if (!res.ok) continue;
    const data = (await res.json()) as { features?: MapboxFeature[] };
    const features = data.features ?? [];
    if (features.length > 0) return features;
  }

  const url = buildMapboxUrl(encodedQuery, {
    token,
    proximity: proximityStr,
    types: "place,locality,neighborhood,address,poi,district,region,postcode,country",
    limit: 10,
    language: "en",
  });
  const res = await fetch(url, { signal });
  if (signal?.aborted || !res.ok) return [];
  const data = (await res.json()) as { features?: MapboxFeature[] };
  return data.features ?? [];
}

export type LocationSearchOptions = {
  signal?: AbortSignal;
  proximity?: { longitude: number; latitude: number };
  recentLocationKeys?: Set<string>;
  /** Local fallback when Mapbox confidence < threshold (popular_locations + saved addresses). */
  getLocalSuggestions?: (q: string) => Promise<LocalSuggestionInput[]>;
  /** City→areas expansion (e.g. "Patna" → Kankarbagh, Boring Road). */
  getCityAreas?: (cityName: string) => Promise<LocalSuggestionInput[]>;
};

function localToEnriched(
  loc: LocalSuggestionInput,
  userCoords: { latitude: number; longitude: number } | undefined,
  recentKeys: Set<string>
): EnrichedPlaceResult {
  const proximity =
    userCoords != null
      ? proximityScore(loc.latitude, loc.longitude, userCoords.latitude, userCoords.longitude)
      : 0.5;
  const usageNorm = Math.min(1, (loc.usageCount ?? 0) / 50);
  const histKey = locationKey(loc.latitude, loc.longitude, loc.primary);
  const historyBoost = recentKeys.has(histKey) ? 0.1 : 0;
  const indiaBoost = indiaKeywordBoost(loc.fullAddress + " " + loc.primary);
  const score =
    proximity * 0.2 +
    usageNorm * 0.2 +
    0.4 +
    indiaBoost +
    historyBoost;
  return {
    primary: loc.primary,
    secondary: loc.secondary.slice(0, 80),
    fullAddress: loc.fullAddress,
    latitude: loc.latitude,
    longitude: loc.longitude,
    area: loc.area ?? undefined,
    city: loc.city ?? undefined,
    distanceKm:
      userCoords != null
        ? haversineKm(userCoords.latitude, userCoords.longitude, loc.latitude, loc.longitude)
        : undefined,
    confidenceScore: Math.min(1, score),
    matchText: loc.primary,
    source: "local",
    usageCount: loc.usageCount,
  };
}

/** Delivery-style order: nearest distance first (ascending), then exact match, then confidence. */
function sortByDeliveryPriority(
  results: EnrichedPlaceResult[],
  query: string,
  userCoords?: { latitude: number; longitude: number }
): void {
  const q = query.trim().toLowerCase();
  const hasDistance = userCoords != null;
  results.sort((a, b) => {
    // 1. When user location available: sort by distance ascending (nearest first)
    if (hasDistance) {
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      if (da !== db) return da - db;
    }
    // 2. Then by exact match (address/query)
    const aAddr = (a.area ?? a.primary ?? "").toLowerCase();
    const bAddr = (b.area ?? b.primary ?? "").toLowerCase();
    const aExact = aAddr.includes(q) || (a.fullAddress ?? "").toLowerCase().includes(q);
    const bExact = bAddr.includes(q) || (b.fullAddress ?? "").toLowerCase().includes(q);
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
  });
}

/**
 * Main entry: multi-layer search (Mapbox → local fallback → fuzzy → city→areas).
 * Strict match guarantee: if any source returns results, we return them.
 */
export async function searchLocations(
  query: string,
  options?: LocationSearchOptions
): Promise<EnrichedPlaceResult[]> {
  const { mapboxAccessToken } = getConfig();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const proximityStr = options?.proximity
    ? `${options.proximity.longitude},${options.proximity.latitude}`
    : undefined;
  const userCoords = options?.proximity
    ? { latitude: options.proximity.latitude, longitude: options.proximity.longitude }
    : undefined;
  const recentKeys = options?.recentLocationKeys ?? new Set<string>();

  const cacheKeyStr = cacheKey(trimmed, proximityStr ?? "");
  const cached = getCached(cacheKeyStr);
  if (cached) return cached;

  // Rule 1 & 2 & 5: Pincode mode – exact match only, no fuzzy, no proximity, no local/city fallback.
  if (isPincodeSearchMode(trimmed)) {
    const pincode = trimmed;
    let pincodeFeatures: MapboxFeature[] = [];
    if (mapboxAccessToken) {
      pincodeFeatures = await fetchMapboxPincodeExact(
        pincode,
        options?.signal,
        mapboxAccessToken
      );
    }
    if (options?.signal?.aborted) return [];
    const results = parsePincodeResults(pincodeFeatures, pincode);
    setCache(cacheKeyStr, results);
    return results;
  }

  let features: MapboxFeature[] = [];
  if (mapboxAccessToken) {
    features = await fetchMapboxForward(
      trimmed,
      proximityStr,
      options?.signal,
      mapboxAccessToken
    );
    if (features.length === 0) {
      const normalized = normalizeQueryForFuzzy(trimmed);
      if (normalized !== trimmed.toLowerCase()) {
        features = await fetchMapboxForward(
          normalized,
          proximityStr,
          options?.signal,
          mapboxAccessToken
        );
      }
    }
  }

  if (options?.signal?.aborted) return [];

  let results = parseAndEnrich(features, userCoords, trimmed, recentKeys);
  const avgRelevance =
    results.length > 0
      ? results.reduce((s, r) => s + (r.confidenceScore ?? 0), 0) / results.length
      : 0;

  const needLocal =
    results.length === 0 || avgRelevance < MAPBOX_CONFIDENCE_THRESHOLD;
  if (needLocal && options?.getLocalSuggestions) {
    try {
      const local = await options.getLocalSuggestions(trimmed);
      if (options?.signal?.aborted) return [];
      const enrichedLocal = local.map((loc) =>
        localToEnriched(loc, userCoords, recentKeys)
      );
      const byKey = new Map<string, EnrichedPlaceResult>();
      enrichedLocal.forEach((r) => {
        const k = locationKey(r.latitude, r.longitude, r.primary);
        if (!byKey.has(k)) byKey.set(k, r);
      });
      results.forEach((r) => {
        const k = locationKey(r.latitude, r.longitude, r.primary);
        if (!byKey.has(k)) byKey.set(k, r);
      });
      results = Array.from(byKey.values());
    } catch {
      // keep Mapbox-only results
    }
  }

  sortByDeliveryPriority(results, trimmed, userCoords);

  const top = results[0];
  const getCityAreas = options?.getCityAreas;
  if (
    getCityAreas &&
    top?.city &&
    (top.primary === top.city || (top.area == null && top.city != null))
  ) {
    try {
      const areas = await getCityAreas(top.city);
      if (options?.signal?.aborted) return results;
      const enrichedAreas = areas.map((loc) =>
        localToEnriched(loc, userCoords, recentKeys)
      );
      const existingKeys = new Set(results.map((r) => locationKey(r.latitude, r.longitude, r.primary)));
      enrichedAreas.forEach((r) => {
        const k = locationKey(r.latitude, r.longitude, r.primary);
        if (!existingKeys.has(k)) {
          existingKeys.add(k);
          results.push(r);
        }
      });
      sortByDeliveryPriority(results, trimmed, userCoords);
    } catch {
      // ignore
    }
  }

  setCache(cacheKeyStr, results);
  return results;
}

/**
 * Backward-compatible PlaceSearchResult (no extra fields).
 * Re-export and adapt so existing callers (searchPlaces, searchPlacesWithProximity) can stay.
 */
export function toLegacyPlaceResult(p: EnrichedPlaceResult): {
  primary: string;
  secondary: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
} {
  return {
    primary: p.primary,
    secondary: p.secondary,
    fullAddress: p.fullAddress,
    latitude: p.latitude,
    longitude: p.longitude,
  };
}
