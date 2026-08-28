/**

 * Cache-first nearby merchants list — MMKV/fastKv + React Query seed.

 * Home paints instantly from last geo-bucket; network refreshes silently.

 */



import type { QueryClient } from "@tanstack/react-query";

import { STORAGE_KEYS } from "@/constants";

import {

  merchantService,

  type MerchantSummary,

} from "@/services/merchant.service";

import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";



export const MERCHANTS_LIST_STALE_MS = 60_000;

export const MERCHANTS_LIST_GC_MS = 30 * 60 * 1000;

const MAX_BUCKETS = 8;



export type MerchantStoreTypeFilter = "FOOD" | "GROCERY" | "ALL";



type CachedMerchantsEntry = {

  items: MerchantSummary[];

  cachedAt: number;

  lat: number;

  lng: number;

  vegOnly: boolean;

  storeType: MerchantStoreTypeFilter;

};



type MerchantsListCacheBlob = Record<string, CachedMerchantsEntry>;



const memoryByKey = new Map<string, CachedMerchantsEntry>();



function normalizeStoreType(storeType?: string | null): MerchantStoreTypeFilter {

  const st = String(storeType ?? "FOOD").trim().toUpperCase();

  if (st === "GROCERY" || st === "ALL") return st;

  return "FOOD";

}



/** ~110m buckets — stable across tiny GPS jitter. */

export function merchantsGeoBucket(lat: number, lng: number): string {

  return `${lat.toFixed(3)}:${lng.toFixed(3)}`;

}



export function merchantsListCacheKey(

  lat: number,

  lng: number,

  vegOnly: boolean,

  storeType: MerchantStoreTypeFilter = "FOOD"

): string {

  // `:road` busts stale air-haversine buckets (3.7 km vs checkout 7.2 km).

  return `${merchantsGeoBucket(lat, lng)}:veg=${vegOnly ? 1 : 0}:st=${normalizeStoreType(storeType)}:road`;

}



/** Bucketed query key so GPS jitter does not cancel in-flight listing fetches. */

export function merchantsQueryKey(

  lat: number,

  lng: number,

  vegOnly: boolean,

  storeType: MerchantStoreTypeFilter = "FOOD"

) {

  return ["merchants", merchantsGeoBucket(lat, lng), vegOnly, normalizeStoreType(storeType)] as const;

}



function parseBlob(raw: string | null | undefined): MerchantsListCacheBlob {

  if (!raw) return {};

  try {

    const parsed = JSON.parse(raw) as MerchantsListCacheBlob;

    return parsed && typeof parsed === "object" ? parsed : {};

  } catch {

    return {};

  }

}



function hydrateMemoryFromFastKvSync(): void {

  const blob = parseBlob(fastGetString(STORAGE_KEYS.MERCHANTS_LIST_CACHE));

  for (const [key, entry] of Object.entries(blob)) {

    if (!entry || !Array.isArray(entry.items) || memoryByKey.has(key)) continue;

    memoryByKey.set(key, entry);

  }

}



hydrateMemoryFromFastKvSync();



export function readSyncMerchantsList(

  lat: number,

  lng: number,

  vegOnly: boolean,

  storeType: MerchantStoreTypeFilter = "FOOD"

): MerchantSummary[] | undefined {

  const entry = readSyncMerchantsListEntry(lat, lng, vegOnly, storeType);

  return entry?.items;

}



/** Returns cached bucket even when empty — instant no-service vs still-loading. */

export function readSyncMerchantsListEntry(

  lat: number,

  lng: number,

  vegOnly: boolean,

  storeType: MerchantStoreTypeFilter = "FOOD"

): CachedMerchantsEntry | undefined {

  if (memoryByKey.size === 0) hydrateMemoryFromFastKvSync();

  return memoryByKey.get(merchantsListCacheKey(lat, lng, vegOnly, storeType));

}



async function readPersistedBlob(): Promise<MerchantsListCacheBlob> {

  const fromFast = parseBlob(fastGetString(STORAGE_KEYS.MERCHANTS_LIST_CACHE));

  if (Object.keys(fromFast).length > 0) return fromFast;

  return {};

}



async function writePersistedBlob(blob: MerchantsListCacheBlob): Promise<void> {

  try {

    fastSetString(STORAGE_KEYS.MERCHANTS_LIST_CACHE, JSON.stringify(blob));

  } catch {

    /* non-blocking */

  }

}



function trimBlob(blob: MerchantsListCacheBlob): MerchantsListCacheBlob {

  const entries = Object.entries(blob).sort((a, b) => b[1].cachedAt - a[1].cachedAt);

  if (entries.length <= MAX_BUCKETS) return blob;

  return Object.fromEntries(entries.slice(0, MAX_BUCKETS));

}



export async function writeCachedMerchantsList(

  lat: number,

  lng: number,

  vegOnly: boolean,

  items: MerchantSummary[],

  storeType: MerchantStoreTypeFilter = "FOOD"

): Promise<void> {

  const st = normalizeStoreType(storeType);

  const key = merchantsListCacheKey(lat, lng, vegOnly, st);

  const entry: CachedMerchantsEntry = {

    items,

    cachedAt: Date.now(),

    lat,

    lng,

    vegOnly,

    storeType: st,

  };

  memoryByKey.set(key, entry);

  const blob = await readPersistedBlob();

  blob[key] = entry;

  await writePersistedBlob(trimBlob(blob));

}



export async function hydrateMerchantsListMemoryFromStorage(): Promise<void> {

  await hydrateFastKvFromAsyncStorage([STORAGE_KEYS.MERCHANTS_LIST_CACHE]);

  hydrateMemoryFromFastKvSync();

}



void hydrateMerchantsListMemoryFromStorage();



/** Seed React Query from disk/memory so home never waits on first paint. */

export function seedMerchantsListQueryIfCached(

  queryClient: QueryClient,

  lat: number,

  lng: number,

  vegOnly: boolean,

  storeType: MerchantStoreTypeFilter = "FOOD"

): boolean {

  const st = normalizeStoreType(storeType);

  const queryKey = merchantsQueryKey(lat, lng, vegOnly, st);

  const existing = queryClient.getQueryData<MerchantSummary[]>(queryKey);

  if (existing != null && existing.length > 0) return true;



  // Never seed an empty bucket — that falsely paints "We're not serving here yet".

  const cached = readSyncMerchantsList(lat, lng, vegOnly, st);

  if (cached == null || cached.length === 0) return false;



  queryClient.setQueryData(queryKey, cached);

  return true;

}



export async function fetchAndCacheMerchantsList(

  lat: number,

  lng: number,

  vegOnly: boolean,

  storeType: MerchantStoreTypeFilter = "FOOD"

): Promise<MerchantSummary[]> {

  const st = normalizeStoreType(storeType);

  // Canonical road km via the same `getRoute` engine as store-quote / checkout.

  const items = await merchantService.getMerchants({

    limit: 20,

    lat,

    lng,

    vegOnly,

    distanceMode: "road",

    storeType: st,

  });

  void writeCachedMerchantsList(lat, lng, vegOnly, items, st);

  return items;

}



export async function prefetchMerchantsList(

  queryClient: QueryClient,

  lat: number,

  lng: number,

  vegOnly: boolean,

  storeType: MerchantStoreTypeFilter = "FOOD"

): Promise<void> {

  const st = normalizeStoreType(storeType);

  seedMerchantsListQueryIfCached(queryClient, lat, lng, vegOnly, st);

  await queryClient.prefetchQuery({

    queryKey: merchantsQueryKey(lat, lng, vegOnly, st),

    queryFn: () => fetchAndCacheMerchantsList(lat, lng, vegOnly, st),

    staleTime: MERCHANTS_LIST_STALE_MS,

    gcTime: MERCHANTS_LIST_GC_MS,

  });

}


