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

export function isRapidoRelevantSuggestion(result: EnrichedPlaceResult, query: string): boolean {
  const q = query.trim();
  if (q.length < 3) return primaryMatchScore(result.primary, q) >= 2;
  return primaryMatchScore(result.primary, q) >= 3;
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
    if (!existing || (item.confidenceScore ?? 0) > (existing.confidenceScore ?? 0)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

/** Sort + filter + dedupe like Rapido: exact → POI/place → nearby. */
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
          return primaryMatchScore(r.primary, trimmed) >= 2 || r.fullAddress.toLowerCase().includes(trimmed.toLowerCase());
        }
        return isRapidoRelevantSuggestion(r, trimmed);
      })
    : deduped;

  filtered.sort((a, b) => {
    const textA = primaryMatchScore(a.primary, trimmed);
    const textB = primaryMatchScore(b.primary, trimmed);
    if (textA !== textB) return textB - textA;

    const featA = featureRank(a);
    const featB = featureRank(b);
    if (featA !== featB) return featB - featA;

    const conf = (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
    if (Math.abs(conf) > 0.03) return conf;

    const da = a.distanceKm ?? Infinity;
    const db = b.distanceKm ?? Infinity;
    if (da !== db) return da - db;

    return a.primary.localeCompare(b.primary);
  });

  return filtered.slice(0, limit);
}
