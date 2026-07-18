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

type CachedMerchantsEntry = {
  items: MerchantSummary[];
  cachedAt: number;
  lat: number;
  lng: number;
  vegOnly: boolean;
};

type MerchantsListCacheBlob = Record<string, CachedMerchantsEntry>;

const memoryByKey = new Map<string, CachedMerchantsEntry>();

/** ~110m buckets — stable across tiny GPS jitter. */
export function merchantsGeoBucket(lat: number, lng: number): string {
  return `${lat.toFixed(3)}:${lng.toFixed(3)}`;
}

export function merchantsListCacheKey(lat: number, lng: number, vegOnly: boolean): string {
  return `${merchantsGeoBucket(lat, lng)}:veg=${vegOnly ? 1 : 0}`;
}

export function merchantsQueryKey(lat: number, lng: number, vegOnly: boolean) {
  return ["merchants", lat, lng, vegOnly] as const;
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
  vegOnly: boolean
): MerchantSummary[] | undefined {
  const entry = readSyncMerchantsListEntry(lat, lng, vegOnly);
  return entry?.items;
}

/** Returns cached bucket even when empty — instant no-service vs still-loading. */
export function readSyncMerchantsListEntry(
  lat: number,
  lng: number,
  vegOnly: boolean
): CachedMerchantsEntry | undefined {
  if (memoryByKey.size === 0) hydrateMemoryFromFastKvSync();
  return memoryByKey.get(merchantsListCacheKey(lat, lng, vegOnly));
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
  items: MerchantSummary[]
): Promise<void> {
  const key = merchantsListCacheKey(lat, lng, vegOnly);
  const entry: CachedMerchantsEntry = {
    items,
    cachedAt: Date.now(),
    lat,
    lng,
    vegOnly,
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
  vegOnly: boolean
): boolean {
  const queryKey = merchantsQueryKey(lat, lng, vegOnly);
  const existing = queryClient.getQueryData<MerchantSummary[]>(queryKey);
  if (existing != null) return true;

  const cached = readSyncMerchantsList(lat, lng, vegOnly);
  if (cached == null) return false;

  queryClient.setQueryData(queryKey, cached);
  return true;
}

export async function fetchAndCacheMerchantsList(
  lat: number,
  lng: number,
  vegOnly: boolean
): Promise<MerchantSummary[]> {
  const items = await merchantService.getMerchants({
    limit: 20,
    lat,
    lng,
    vegOnly,
    distanceMode: "road",
  });
  void writeCachedMerchantsList(lat, lng, vegOnly, items);
  return items;
}

export async function prefetchMerchantsList(
  queryClient: QueryClient,
  lat: number,
  lng: number,
  vegOnly: boolean
): Promise<void> {
  seedMerchantsListQueryIfCached(queryClient, lat, lng, vegOnly);
  await queryClient.prefetchQuery({
    queryKey: merchantsQueryKey(lat, lng, vegOnly),
    queryFn: () => fetchAndCacheMerchantsList(lat, lng, vegOnly),
    staleTime: MERCHANTS_LIST_STALE_MS,
    gcTime: MERCHANTS_LIST_GC_MS,
  });
}
