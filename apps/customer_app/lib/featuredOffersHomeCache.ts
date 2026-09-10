/**
 * Disk-backed featured FOOD home offers — instant ribbon / hero fallback paint.
 */

import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
import {
  normalizeOfferLocationParams,
  type OfferLocationParams,
} from "@/lib/featuredOfferGeo";
import { prefetchFeaturedOfferHeroImages } from "@/lib/prefetchGridFirstHeroMedia";
import type { FeaturedOffersResponse } from "@/services/offers.service";
import { offersService } from "@/services/offers.service";

export type FeaturedOffersHomeParams = OfferLocationParams;

type CachedFeaturedOffersEntry = {
  data: FeaturedOffersResponse;
  cachedAt: number;
  geoKey: string;
};

type FeaturedOffersCacheBlob = Record<string, CachedFeaturedOffersEntry>;

const memoryByGeo = new Map<string, CachedFeaturedOffersEntry>();
const MAX_BUCKETS = 6;

function geoKey(params: OfferLocationParams): string {
  const p = normalizeOfferLocationParams(params);
  return [p.lat ?? "", p.lng ?? "", p.pincode ?? "", p.state ?? "", p.city ?? ""].join("|");
}

function parseBlob(raw: string | null | undefined): FeaturedOffersCacheBlob {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as FeaturedOffersCacheBlob;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function hydrateMemorySync(): void {
  const blob = parseBlob(fastGetString(STORAGE_KEYS.FEATURED_OFFERS_HOME_CACHE));
  for (const [key, entry] of Object.entries(blob)) {
    if (!entry?.data?.offers || memoryByGeo.has(key)) continue;
    memoryByGeo.set(key, entry);
  }
}

hydrateMemorySync();

void hydrateFastKvFromAsyncStorage([STORAGE_KEYS.FEATURED_OFFERS_HOME_CACHE]).then(() => {
  hydrateMemorySync();
  for (const entry of memoryByGeo.values()) {
    prefetchFeaturedOfferHeroImages(entry.data?.offers);
  }
});

export function featuredOffersHomeQueryKey(params: FeaturedOffersHomeParams) {
  const p = normalizeOfferLocationParams(params);
  return ["featured-offers-home", p.lat, p.lng, p.pincode, p.state, p.city] as const;
}

export function featuredOffersHomeQueryOptions(params: FeaturedOffersHomeParams) {
  const p = normalizeOfferLocationParams(params);
  return {
    queryKey: featuredOffersHomeQueryKey(p),
    queryFn: () => fetchAndCacheFeaturedOffersHome(p),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  } as const;
}

export function readSyncFeaturedOffersHome(
  params: OfferLocationParams
): FeaturedOffersResponse | undefined {
  if (memoryByGeo.size === 0) hydrateMemorySync();
  const key = geoKey(params);
  const exact = memoryByGeo.get(key);
  if (exact?.data?.offers?.length) return exact.data;
  let best: CachedFeaturedOffersEntry | undefined;
  for (const entry of memoryByGeo.values()) {
    if (!entry?.data?.offers?.length) continue;
    if (!best || (entry.cachedAt ?? 0) > (best.cachedAt ?? 0)) best = entry;
  }
  return best?.data;
}

export function getFeaturedOffersHomeCachedAt(params: OfferLocationParams): number | undefined {
  if (memoryByGeo.size === 0) hydrateMemorySync();
  return memoryByGeo.get(geoKey(params))?.cachedAt;
}

export function writePersistedFeaturedOffersHome(
  params: OfferLocationParams,
  data: FeaturedOffersResponse
): void {
  if (!data?.offers) return;
  const key = geoKey(params);
  const entry: CachedFeaturedOffersEntry = {
    data,
    cachedAt: Date.now(),
    geoKey: key,
  };
  memoryByGeo.set(key, entry);
  prefetchFeaturedOfferHeroImages(data.offers);

  const blob = parseBlob(fastGetString(STORAGE_KEYS.FEATURED_OFFERS_HOME_CACHE));
  blob[key] = entry;
  const keys = Object.keys(blob);
  if (keys.length > MAX_BUCKETS) {
    keys
      .sort((a, b) => (blob[a]?.cachedAt ?? 0) - (blob[b]?.cachedAt ?? 0))
      .slice(0, keys.length - MAX_BUCKETS)
      .forEach((k) => delete blob[k]);
  }
  try {
    fastSetString(STORAGE_KEYS.FEATURED_OFFERS_HOME_CACHE, JSON.stringify(blob));
  } catch {
    /* ignore */
  }
}

export function seedFeaturedOffersHomeQueryIfCached(
  queryClient: QueryClient,
  params: OfferLocationParams
): FeaturedOffersResponse | undefined {
  const cached = readSyncFeaturedOffersHome(params);
  if (!cached?.offers?.length) return undefined;
  const queryKey = featuredOffersHomeQueryKey(params);
  if (!queryClient.getQueryData(queryKey)) {
    queryClient.setQueryData(queryKey, cached);
  }
  prefetchFeaturedOfferHeroImages(cached.offers);
  return cached;
}

export async function fetchAndCacheFeaturedOffersHome(
  params: OfferLocationParams
): Promise<FeaturedOffersResponse> {
  const p = normalizeOfferLocationParams(params);
  const data = await offersService.getFeaturedOffers({
    pincode: p.pincode,
    state: p.state,
    city: p.city,
    lat: p.lat,
    lng: p.lng,
    serviceType: "FOOD",
    limit: 6,
  });
  writePersistedFeaturedOffersHome(p, data);
  return data;
}

export function prefetchFeaturedOffersHomeCached(
  queryClient: QueryClient,
  params: OfferLocationParams
) {
  seedFeaturedOffersHomeQueryIfCached(queryClient, params);
  return queryClient.prefetchQuery(featuredOffersHomeQueryOptions(params));
}
