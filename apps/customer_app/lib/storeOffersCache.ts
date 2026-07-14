/**
 * Disk-backed store offers — instant offer strip on restaurant reopen.
 */

import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import type { StoreOffersResponse } from "@/services/offers.service";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
import {
  buildStoreOffersQueryKey,
  type StoreOffersGeo,
  STORE_OFFERS_STALE_MS,
} from "@/lib/prefetchStoreOffers";

type CachedOffersEntry = {
  data: StoreOffersResponse;
  cachedAt: number;
  geoKey: string;
};

type StoreOffersCacheBlob = Record<string, CachedOffersEntry>;

const memoryByStore = new Map<string, CachedOffersEntry>();
const MAX_STORES = 20;

function geoKey(geo?: StoreOffersGeo): string {
  return [
    geo?.pincode?.trim() || "",
    geo?.state?.trim() || "",
    geo?.lat != null ? String(Math.round(geo.lat * 1000) / 1000) : "",
    geo?.lng != null ? String(Math.round(geo.lng * 1000) / 1000) : "",
  ].join("|");
}

function parseBlob(raw: string | null | undefined): StoreOffersCacheBlob {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as StoreOffersCacheBlob;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function hydrateMemorySync(): void {
  const blob = parseBlob(fastGetString(STORAGE_KEYS.STORE_OFFERS_CACHE));
  for (const [storeId, entry] of Object.entries(blob)) {
    if (!entry?.data || memoryByStore.has(storeId)) continue;
    memoryByStore.set(storeId, entry);
  }
}

hydrateMemorySync();

export function readSyncPersistedStoreOffers(
  merchantId: string,
  geo?: StoreOffersGeo
): StoreOffersResponse | undefined {
  if (!merchantId) return undefined;
  if (memoryByStore.size === 0) hydrateMemorySync();
  const entry = memoryByStore.get(merchantId);
  if (!entry?.data) return undefined;
  // Prefer exact geo match; otherwise still return last known offers for instant paint.
  if (entry.geoKey && geoKey(geo) && entry.geoKey !== geoKey(geo)) {
    return entry.data;
  }
  return entry.data;
}

/** Disk/memory cachedAt for React Query initialDataUpdatedAt (mark seed stale like Food Home). */
export function getStoreOffersCachedAt(merchantId: string): number | undefined {
  if (!merchantId) return undefined;
  if (memoryByStore.size === 0) hydrateMemorySync();
  const entry = memoryByStore.get(merchantId);
  return entry?.cachedAt;
}

export async function writePersistedStoreOffers(
  merchantId: string,
  data: StoreOffersResponse,
  geo?: StoreOffersGeo
): Promise<void> {
  if (!merchantId || !data) return;
  const entry: CachedOffersEntry = {
    data,
    cachedAt: Date.now(),
    geoKey: geoKey(geo),
  };
  memoryByStore.set(merchantId, entry);

  const blob = parseBlob(fastGetString(STORAGE_KEYS.STORE_OFFERS_CACHE));
  blob[merchantId] = entry;
  const entries = Object.entries(blob).sort((a, b) => b[1].cachedAt - a[1].cachedAt);
  const trimmed = Object.fromEntries(entries.slice(0, MAX_STORES));
  try {
    fastSetString(STORAGE_KEYS.STORE_OFFERS_CACHE, JSON.stringify(trimmed));
  } catch {
    /* non-blocking */
  }
}

export async function hydrateStoreOffersMemoryFromStorage(): Promise<void> {
  await hydrateFastKvFromAsyncStorage([STORAGE_KEYS.STORE_OFFERS_CACHE]);
  hydrateMemorySync();
}

void hydrateStoreOffersMemoryFromStorage();

export function seedStoreOffersQueryIfCached(
  queryClient: QueryClient,
  merchantId: string,
  geo?: StoreOffersGeo
): boolean {
  const queryKey = buildStoreOffersQueryKey(merchantId, geo);
  if (queryClient.getQueryData<StoreOffersResponse>(queryKey)) return true;
  const cached = readSyncPersistedStoreOffers(merchantId, geo);
  if (!cached) return false;
  const cachedAt = getStoreOffersCachedAt(merchantId) ?? Date.now() - STORE_OFFERS_STALE_MS;
  queryClient.setQueryData(queryKey, cached, { updatedAt: cachedAt });
  return true;
}

export { STORE_OFFERS_STALE_MS };
