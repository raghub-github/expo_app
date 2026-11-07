/**
 * Rapido-style location suggestion ranking, filtering, and deduplication.
 */

import type { EnrichedPlaceResult } from "@/services/locationSearch.service";

const FEATURE_TYPE_RANK: Record<string, number> = {
  place: 5,
  poi: 4,
  locality: 3,
  neighborhood: 2,
  district: 2,
  street: 1,
  address: 1,
  postcode: 0,
};

export const RAPIDO_SUGGESTION_LIMIT = 10;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Score how well `primary` matches typed query (Rapido-style word boundaries). */
export function primaryMatchScore(primary: string, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const p = primary.trim().toLowerCase();
  if (!p) return 0;

  if (p === q) return 10;

  if (p.startsWith(`${q} `)) return 9;

  const words = p.split(/\s+/).filter(Boolean);
  if (words.some((w) => w === q)) return 9;

  if (words[0] === q || words[0]?.startsWith(`${q}-`)) return 8;

  // POI names: "Gaya Junction", "Gaya Airport"
  if (words[0]?.startsWith(q) && words.length > 1) return 8;

  // Single glued word e.g. "Gayaspur" for query "gaya" — demote
  if (words.length === 1 && words[0]!.startsWith(q) && words[0]!.length > q.length + 1) {
    return 1;
  }

  if (new RegExp(`\\b${escapeRegExp(q)}\\b`, "i").test(p)) return 6;

  if (p.startsWith(q)) return 5;

  if (p.includes(q)) return 2;

  return 0;
}

/**
 * Best textual match across ALL display fields, not just `primary`.
 *
 * A location's typed match often lands in its address / locality / POI context
 * (villages, roads, landmarks, buildings, stations) rather than its short name.
 * Scoring only `primary` silently drops those valid results.
 */
export function bestMatchScore(result: EnrichedPlaceResult, query: string): number {
  const fields = [
    result.primary,
    result.matchText,
    result.area,
    result.city,
    result.secondary,
    result.fullAddress,
  ];
  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    const score = primaryMatchScore(field, query);
    if (score > best) best = score;
    if (best >= 9) break;
  }
  return best;
}

export function isRapidoRelevantSuggestion(result: EnrichedPlaceResult, query: string): boolean {
  const q = query.trim();
  // Mapbox Search Box `suggest` already applies server-side text-relevance + proximity
  // ranking (the same engine Rapido/Uber use). Re-filtering its suggestions against only
  // `primary` wrongly discards valid results whose match lies in the address/locality.
  // Trust Mapbox suggestions; only relevance-gate local/DB fallback entries.
  if (result.source === "mapbox") return true;
  return bestMatchScore(result, q) >= 2;
}

function featureRank(result: EnrichedPlaceResult): number {
  const type = (result.featureType ?? "").toLowerCase();
  return FEATURE_TYPE_RANK[type] ?? 1;
}

export function dedupeSearchResults(results: EnrichedPlaceResult[]): EnrichedPlaceResult[] {
  const byKey = new Map<string, EnrichedPlaceResult>();
  for (const item of results) {
    const mapboxId = item.mapboxSuggestion?.mapbox_id;
    const key = mapboxId
      ? `mbx:${mapboxId}`
      : `${item.primary.trim().toLowerCase()}|${(item.city ?? item.secondary).trim().toLowerCase()}`;
    const existing = byKey.get(key);
    const delta = (item.confidenceScore ?? 0) - (existing?.confidenceScore ?? 0);
    // On a tie keep the broader feature: "Andheri West" the locality, not a street of that name.
    if (!existing || delta > 0 || (delta === 0 && featureRank(item) > featureRank(existing))) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

/** Nearby results beat equally-named ones in another state; a far exact match can still win. */
function distanceBonus(distanceKm: number | undefined): number {
  if (distanceKm == null) return 0;
  if (distanceKm <= 3) return 5;
  if (distanceKm <= 10) return 4;
  if (distanceKm <= 30) return 3;
  if (distanceKm <= 100) return 1;
  if (distanceKm <= 500) return -1;
  return -4;
}

/**
 * Text match for ordering. A hit in the place's own name counts in full; one only in its
 * address counts for half, so a salon that merely IS in "Koramangala 5th Block" cannot
 * outrank the neighbourhood actually called that. (Such hits still pass the relevance
 * filter, which uses bestMatchScore.)
 */
function rankingTextScore(result: EnrichedPlaceResult, query: string): number {
  return Math.max(primaryMatchScore(result.primary, query), bestMatchScore(result, query) * 0.5);
}

/** Overall relevance. Text match leads; type, distance and provider confidence adjust it. */
export function suggestionRelevance(result: EnrichedPlaceResult, query: string): number {
  return (
    rankingTextScore(result, query) +
    featureRank(result) * 0.6 +
    distanceBonus(result.distanceKm) +
    (result.confidenceScore ?? 0) * 2
  );
}

function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Combine Search Box and Geocoding v6 results. The same place found by both is kept once,
 * preferring the v6 entry: it already has coordinates, so tapping it is instant.
 * Fills in distance from the user wherever a provider left it out.
 */
export function mergeProviderResults(
  searchBox: EnrichedPlaceResult[],
  geocoding: EnrichedPlaceResult[],
  user?: { latitude: number; longitude: number }
): EnrichedPlaceResult[] {
  const seen = new Set(
    geocoding.map((r) => `${normalizedName(r.primary)}|${normalizedName(r.city ?? "")}`)
  );
  const merged = [
    ...geocoding,
    ...searchBox.filter((r) => !seen.has(`${normalizedName(r.primary)}|${normalizedName(r.city ?? "")}`)),
  ];
  if (!user) return merged;
  return merged.map((r) => {
    if (r.distanceKm != null || r.pendingRetrieve) return r;
    return { ...r, distanceKm: kmBetween(user.latitude, user.longitude, r.latitude, r.longitude) };
  });
}

const LEADING_UNIT = /^(?:flat|house|h\.?\s?no\.?|plot|room|shop|door|no\.?|#)\s*[\w/-]+[\s,]+/i;
const LEADING_RELATION = /^(?:near|nr\.?|opp\.?|opposite|behind|beside|next to|in front of)\s+/i;

/**
 * Simpler forms of a full typed address, for when it finds nothing as written. People
 * type "Flat 203, Shanti Apartment, Kankarbagh, Patna"; the map knows the last parts.
 * Most specific first, excluding the original.
 */
export function simplifySearchQuery(query: string): string[] {
  const original = query.trim();
  const stripped = original.replace(LEADING_UNIT, "").replace(LEADING_RELATION, "").trim();
  const parts = stripped.split(",").map((p) => p.trim()).filter(Boolean);
  const words = stripped.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const variants = [
    stripped,
    parts.length >= 2 ? parts.slice(-2).join(", ") : "",
    parts.length < 2 && words.length > 3 ? words.slice(-3).join(" ") : "",
    words.length > 1 ? words.slice(-2).join(" ") : "",
  ];
  const seen = new Set([original.toLowerCase()]);
  return variants.filter((v) => {
    const key = v.toLowerCase();
    if (v.length < 3 || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Sort + filter + dedupe like Rapido: best overall relevance first. */
export function finalizeRapidoSuggestions(
  results: EnrichedPlaceResult[],
  query: string,
  limit = RAPIDO_SUGGESTION_LIMIT
): EnrichedPlaceResult[] {
  const trimmed = query.trim();
  const deduped = dedupeSearchResults(results);

  const filtered = trimmed
    ? deduped.filter((r) => {
        if (r.resultSection === "saved" || r.resultSection === "recent") {
          return bestMatchScore(r, trimmed) >= 2 || r.fullAddress.toLowerCase().includes(trimmed.toLowerCase());
        }
        return isRapidoRelevantSuggestion(r, trimmed);
      })
    : deduped;

  filtered.sort((a, b) => {
    const score = suggestionRelevance(b, trimmed) - suggestionRelevance(a, trimmed);
    if (Math.abs(score) > 0.001) return score;
    const da = a.distanceKm ?? Infinity;
    const db = b.distanceKm ?? Infinity;
    if (da !== db) return da - db;
    return a.primary.localeCompare(b.primary);
  });

  return filtered.slice(0, limit);
}
