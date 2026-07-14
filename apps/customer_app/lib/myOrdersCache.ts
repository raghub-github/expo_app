/**
 * Disk-backed my-orders — instant "Your Orders & Collections" on store reopen.
 */

import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";

type OrderLike = Record<string, unknown>;

type CachedMyOrders = {
  orders: OrderLike[];
  cachedAt: number;
};

let memory: CachedMyOrders | null = null;

function parse(raw: string | null | undefined): CachedMyOrders | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedMyOrders;
    if (!parsed || !Array.isArray(parsed.orders)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hydrateMemorySync(): void {
  if (memory) return;
  memory = parse(fastGetString(STORAGE_KEYS.MY_ORDERS_CACHE));
}

hydrateMemorySync();

export function readSyncMyOrders(): OrderLike[] | undefined {
  hydrateMemorySync();
  return memory?.orders?.length ? memory.orders : undefined;
}

export function getMyOrdersCachedAt(): number | undefined {
  hydrateMemorySync();
  return memory?.cachedAt;
}

export async function writeCachedMyOrders(orders: unknown[]): Promise<void> {
  if (!Array.isArray(orders)) return;
  const entry: CachedMyOrders = {
    orders: orders as OrderLike[],
    cachedAt: Date.now(),
  };
  memory = entry;
  try {
    fastSetString(STORAGE_KEYS.MY_ORDERS_CACHE, JSON.stringify(entry));
  } catch {
    /* non-blocking */
  }
}

export async function hydrateMyOrdersMemoryFromStorage(): Promise<void> {
  await hydrateFastKvFromAsyncStorage([STORAGE_KEYS.MY_ORDERS_CACHE]);
  memory = null;
  hydrateMemorySync();
}

void hydrateMyOrdersMemoryFromStorage();

export function seedMyOrdersStoreQueryIfCached(
  queryClient: QueryClient,
  merchantId: string
): boolean {
  if (!merchantId) return false;
  const queryKey = ["my-orders-store", merchantId] as const;
  if (queryClient.getQueryData(queryKey)) return true;
  const cached = readSyncMyOrders();
  if (!cached?.length) return false;
  queryClient.setQueryData(queryKey, cached);
  return true;
}
