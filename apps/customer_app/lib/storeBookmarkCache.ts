/**
 * Disk-backed store bookmarks so hearts survive restart before / if the API returns.
 */

import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
import { getActiveCustomerScopeId, isOwnedByActiveCustomer } from "@/lib/customerScope";

const QUERY_KEY = ["store-bookmarks"] as const;

type CachedStoreBookmarks = {
  storeIds: string[];
  cachedAt: number;
  customerId?: string | null;
};

let memory: CachedStoreBookmarks | null = null;

function parse(raw: string | null | undefined): CachedStoreBookmarks | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedStoreBookmarks;
    if (!parsed || !Array.isArray(parsed.storeIds)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hydrateMemorySync(): void {
  if (memory) return;
  memory = parse(fastGetString(STORAGE_KEYS.STORE_BOOKMARKS_CACHE));
}

hydrateMemorySync();

function ownedMemory(): CachedStoreBookmarks | null {
  hydrateMemorySync();
  if (!memory) return null;
  if (!isOwnedByActiveCustomer(memory.customerId)) return null;
  return memory;
}

export function readSyncStoreBookmarks(): string[] | undefined {
  const entry = ownedMemory();
  return entry?.storeIds;
}

export async function writeCachedStoreBookmarks(storeIds: string[]): Promise<void> {
  if (!Array.isArray(storeIds)) return;
  const customerId = getActiveCustomerScopeId();
  if (!customerId) return;
  const unique = [...new Set(storeIds.filter((id) => typeof id === "string" && id.length > 0))];
  const entry: CachedStoreBookmarks = {
    storeIds: unique,
    cachedAt: Date.now(),
    customerId,
  };
  memory = entry;
  try {
    fastSetString(STORAGE_KEYS.STORE_BOOKMARKS_CACHE, JSON.stringify(entry));
  } catch {
    /* non-blocking */
  }
}

export function clearCachedStoreBookmarks(): void {
  memory = null;
  try {
    fastSetString(STORAGE_KEYS.STORE_BOOKMARKS_CACHE, "");
  } catch {
    /* ignore */
  }
}

export async function hydrateStoreBookmarksFromStorage(): Promise<void> {
  await hydrateFastKvFromAsyncStorage([STORAGE_KEYS.STORE_BOOKMARKS_CACHE]);
  memory = null;
  hydrateMemorySync();
}

void hydrateStoreBookmarksFromStorage();

export function seedStoreBookmarksQuery(queryClient: QueryClient): boolean {
  if (queryClient.getQueryData(QUERY_KEY)) return true;
  const cached = readSyncStoreBookmarks();
  if (!cached) return false;
  queryClient.setQueryData(QUERY_KEY, cached);
  return true;
}
