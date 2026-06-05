/**
 * Unified location search hook — Mapbox Search Box + saved + recent.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  searchPlacesEnriched,
  resolveMapboxEnrichedPlace,
  MAPBOX_SEARCH_DEBOUNCE_MS,
  isPincodeSearchMode,
  type MapboxSearchSessionContext,
  type EnrichedPlaceResult,
} from "@/services/location.service";
import { addressService, type Address } from "@/services/address.service";
import { useRecentLocationStore } from "@/store/recentLocationStore";
import { finalizeRapidoSuggestions } from "@/lib/location-search-ranking";
import { locationKey } from "@/services/locationSearch.service";

export type UseLocationSearchOptions = {
  sessionContext: MapboxSearchSessionContext;
  proximity?: { latitude: number; longitude: number } | null;
  savedAddresses?: Address[];
  /** Include recent + saved when query empty */
  showBrowseWhenEmpty?: boolean;
  debounceMs?: number;
};

function savedToEnriched(addr: Address): EnrichedPlaceResult {
  const label = addr.label?.trim();
  return {
    primary: label && label.length > 0 ? label : addr.fullAddress.split(",")[0]?.trim() || "Saved place",
    secondary: addr.fullAddress.slice(0, 120),
    fullAddress: addr.fullAddress,
    latitude: addr.latitude,
    longitude: addr.longitude,
    city: addr.city ?? undefined,
    state: addr.state ?? undefined,
    pincode: addr.pincode ?? undefined,
    confidenceScore: 0.95,
    source: "local",
    savedLabel: label ?? undefined,
    resultSection: "saved",
    pendingRetrieve: false,
  };
}

function recentToEnriched(
  item: { latitude: number; longitude: number; primary: string; fullAddress?: string },
  filterQuery?: string
): EnrichedPlaceResult | null {
  const q = filterQuery?.trim().toLowerCase() ?? "";
  const hay = `${item.primary} ${item.fullAddress ?? ""}`.toLowerCase();
  if (q && !hay.includes(q)) return null;
  return {
    primary: item.primary,
    secondary: (item.fullAddress ?? "").slice(0, 120),
    fullAddress: item.fullAddress ?? item.primary,
    latitude: item.latitude,
    longitude: item.longitude,
    confidenceScore: 0.88,
    source: "local",
    resultSection: "recent",
    pendingRetrieve: false,
  };
}

function rankMergedResults(results: EnrichedPlaceResult[], query: string): EnrichedPlaceResult[] {
  const q = query.trim().toLowerCase();
  return [...results].sort((a, b) => {
    const sectionOrder = { saved: 0, recent: 1, search: 2 };
    const sa = sectionOrder[a.resultSection ?? "search"];
    const sb = sectionOrder[b.resultSection ?? "search"];
    if (sa !== sb) return sa - sb;
    if (q) {
      const match = (r: EnrichedPlaceResult) => {
        const hay = `${r.primary} ${r.fullAddress}`.toLowerCase();
        if (hay.startsWith(q)) return 3;
        if (hay.includes(q)) return 2;
        return 0;
      };
      const ma = match(a);
      const mb = match(b);
      if (ma !== mb) return mb - ma;
    }
    const da = a.distanceKm ?? Infinity;
    const db = b.distanceKm ?? Infinity;
    if (da !== db) return da - db;
    return (b.confidenceScore ?? 0) - (a.confidenceScore ?? 0);
  });
}

export function useLocationSearch(options: UseLocationSearchOptions) {
  const {
    sessionContext,
    proximity,
    savedAddresses = [],
    showBrowseWhenEmpty = true,
    debounceMs = MAPBOX_SEARCH_DEBOUNCE_MS,
  } = options;

  const recentItems = useRecentLocationStore((s) => s.items);
  const getRecentLocationKeys = useRecentLocationStore((s) => s.getRecentLocationKeys);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EnrichedPlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const buildBrowseResults = useCallback(
    (filterQuery?: string) => {
      const saved = savedAddresses.map(savedToEnriched);
      const recent = recentItems
        .map((item) => recentToEnriched(item, filterQuery))
        .filter((r): r is EnrichedPlaceResult => r != null);
      const byKey = new Map<string, EnrichedPlaceResult>();
      [...saved, ...recent].forEach((r) => {
        const key = locationKey(r.latitude, r.longitude, r.primary);
        if (!byKey.has(key)) byKey.set(key, r);
      });
      return rankMergedResults(Array.from(byKey.values()), filterQuery ?? "");
    },
    [savedAddresses, recentItems]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = query.trim();
    const isPincode = isPincodeSearchMode(trimmed);
    const minChars = isPincode ? 6 : 2;

    if (!trimmed) {
      abortRef.current?.abort();
      setLoading(false);
      setResults(showBrowseWhenEmpty ? buildBrowseResults() : []);
      return;
    }

    if (trimmed.length < minChars) {
      abortRef.current?.abort();
      setLoading(false);
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      const getLocal = (q: string) => addressService.getLocationSearchSuggestions(q, 12);
      const getCityAreas = (city: string) => addressService.getCityAreaSuggestions(city, 12);

      searchPlacesEnriched(trimmed, {
        signal: controller.signal,
        proximity: proximity ?? undefined,
        sessionContext,
        recentLocationKeys: getRecentLocationKeys(),
        getLocalSuggestions: getLocal,
        getCityAreas,
      })
        .then(async (searchResults) => {
          if (controller.signal.aborted) return;
          const savedMatches = savedAddresses
            .filter((a) => {
              const hay = `${a.label ?? ""} ${a.fullAddress}`.toLowerCase();
              return hay.includes(trimmed.toLowerCase());
            })
            .map(savedToEnriched);
          const recentMatches = recentItems
            .map((item) => recentToEnriched(item, trimmed))
            .filter((r): r is EnrichedPlaceResult => r != null);

          const merged = rankMergedResults(
            [...savedMatches, ...recentMatches, ...searchResults.map((r) => ({ ...r, resultSection: "search" as const }))],
            trimmed
          );
          setResults(finalizeRapidoSuggestions(merged, trimmed));
        })
        .catch(() => {
          if (!controller.signal.aborted) setResults([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [
    query,
    proximity?.latitude,
    proximity?.longitude,
    sessionContext,
    debounceMs,
    showBrowseWhenEmpty,
    buildBrowseResults,
    getRecentLocationKeys,
    savedAddresses,
    recentItems,
  ]);

  const selectResult = useCallback(
    async (place: EnrichedPlaceResult): Promise<EnrichedPlaceResult> => {
      setResolving(true);
      try {
        return await resolveMapboxEnrichedPlace(place, sessionContext);
      } finally {
        setResolving(false);
      }
    },
    [sessionContext]
  );

  const queryReady =
    isPincodeSearchMode(query.trim()) ? query.trim().length >= 6 : query.trim().length >= 2;

  return {
    query,
    setQuery,
    results,
    loading,
    resolving,
    queryReady,
    selectResult,
    showEmpty: !loading && results.length === 0 && queryReady,
    showBrowse: !query.trim() && results.length > 0,
  };
}
