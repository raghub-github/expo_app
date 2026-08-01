/**
 * Disk-backed my-orders — instant "Your Orders & Collections" on store reopen.
 */

import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
import { getActiveCustomerScopeId, isOwnedByActiveCustomer } from "@/lib/customerScope";

type OrderLike = Record<string, unknown>;

type CachedMyOrders = {
  orders: OrderLike[];
  cachedAt: number;
  /** Customer this payload belongs to; reads by anyone else are refused. */
  customerId?: string | null;
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

/**
 * Cached payload only when it belongs to the signed-in customer. Orders are the
 * one cache that paints before any network call (floating track pill, Orders
 * tab), so an unowned entry must never be handed back.
 */
function ownedMemory(): CachedMyOrders | null {
  hydrateMemorySync();
  if (!memory) return null;
  if (!isOwnedByActiveCustomer(memory.customerId)) return null;
  return memory;
}

export function readSyncMyOrders(): OrderLike[] | undefined {
  const entry = ownedMemory();
  return entry?.orders?.length ? entry.orders : undefined;
}

export function getMyOrdersCachedAt(): number | undefined {
  return ownedMemory()?.cachedAt;
}

export async function writeCachedMyOrders(orders: unknown[]): Promise<void> {
  if (!Array.isArray(orders)) return;
  const customerId = getActiveCustomerScopeId();
  // No signed-in customer => nothing to attribute the payload to; skip the write
  // rather than persist an unowned blob.
  if (!customerId) return;
  const entry: CachedMyOrders = {
    orders: orders as OrderLike[],
    cachedAt: Date.now(),
    customerId,
  };
  memory = entry;
  try {
    fastSetString(STORAGE_KEYS.MY_ORDERS_CACHE, JSON.stringify(entry));
  } catch {
    /* non-blocking */
  }
}

export function clearCachedMyOrders(): void {
  memory = null;
  try {
    fastSetString(STORAGE_KEYS.MY_ORDERS_CACHE, "");
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

/** Seed the shared My Orders list so the Orders tab paints instantly. */
export function seedMyOrdersQueryIfCached(queryClient: QueryClient): boolean {
  const queryKey = ["my-orders"] as const;
  if (queryClient.getQueryData(queryKey)) return true;
  const cached = readSyncMyOrders();
  if (!cached?.length) return false;
  queryClient.setQueryData(queryKey, cached);
  return true;
}
