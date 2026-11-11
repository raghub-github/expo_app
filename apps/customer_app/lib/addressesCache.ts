/**
 * Disk-backed saved addresses — Select location must paint instantly, never
 * wait on network / GPS / startup gate for a list the user already has.
 */

import type { QueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS } from "@/constants";
import type { Address } from "@/services/address.service";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
import { getActiveCustomerScopeId } from "@/lib/customerScope";
import { useLocationStore } from "@/store/locationStore";

/** Keep in sync with hooks/useAddresses ADDRESSES_QUERY_KEY (avoid circular import). */
const ADDRESSES_QUERY_KEY = ["addresses"] as const;

type CachedAddresses = {
  addresses: Address[];
  cachedAt: number;
  customerId?: string | null;
};

type AddressLike = Partial<Address> & {
  id: number;
  fullAddress: string;
  latitude: number;
  longitude: number;
};

let memory: CachedAddresses | null = null;
let subscribedQueryClient: QueryClient | null = null;

function parse(raw: string | null | undefined): CachedAddresses | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CachedAddresses | Address[];
    if (Array.isArray(parsed)) {
      return { addresses: parsed, cachedAt: 0, customerId: null };
    }
    if (!parsed || !Array.isArray(parsed.addresses)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function hydrateMemorySync(): void {
  if (memory) return;
  memory = parse(fastGetString(STORAGE_KEYS.ADDRESSES_CACHE));
}

function ownedMemory(): CachedAddresses | null {
  hydrateMemorySync();
  if (!memory) return null;
  const active = getActiveCustomerScopeId();
  // Scope still hydrating / signed-out briefly — still paint the last list rather
  // than force a network spinner. Refuse only on a hard cross-account mismatch.
  if (
    active &&
    memory.customerId != null &&
    memory.customerId.length > 0 &&
    memory.customerId !== active
  ) {
    return null;
  }
  return memory;
}

hydrateMemorySync();
void hydrateFastKvFromAsyncStorage([STORAGE_KEYS.ADDRESSES_CACHE]).then(() => {
  if (!memory) memory = parse(fastGetString(STORAGE_KEYS.ADDRESSES_CACHE));
});

function toAddress(row: AddressLike): Address {
  return {
    id: row.id,
    label: row.label ?? null,
    fullAddress: row.fullAddress,
    landmark: row.landmark ?? null,
    city: row.city ?? null,
    state: row.state ?? null,
    pincode: row.pincode ?? null,
    country: row.country ?? "IN",
    latitude: row.latitude,
    longitude: row.longitude,
    contactName: row.contactName ?? null,
    contactMobile: row.contactMobile ?? null,
    deliveryDoorImageUrl: row.deliveryDoorImageUrl ?? null,
    deliveryInstructionsList: row.deliveryInstructionsList ?? [],
    isDefault: row.isDefault ?? false,
    isLastUsed: row.isLastUsed ?? false,
    lastUsedAt: row.lastUsedAt ?? null,
    isSelected: row.isSelected ?? false,
  };
}

/**
 * Instant offline seed from the currently selected delivery pin (reconcile /
 * last selection). Enough to paint Select location on low internet.
 */
export function bootstrapAddressesFromSession(): Address[] | undefined {
  const state = useLocationStore.getState();
  if (state.locationSource !== "selected") return undefined;
  const id = state.sessionBoundAddressId;
  if (id == null || !state.coords || !state.address) return undefined;
  const full =
    state.address.fullAddress?.trim() ||
    state.address.secondary?.trim() ||
    state.address.primary?.trim();
  if (!full) return undefined;
  return [
    toAddress({
      id,
      label: state.address.primary?.trim() || null,
      fullAddress: full,
      city: state.address.city ?? null,
      state: state.address.state ?? null,
      pincode: state.address.pincode ?? null,
      latitude: state.coords.latitude,
      longitude: state.coords.longitude,
      isDefault: true,
      isLastUsed: true,
      isSelected: true,
    }),
  ];
}

/** Sync read for first paint (MMKV / warm memory / session bootstrap). */
export function readSyncCachedAddresses(): Address[] | undefined {
  const entry = ownedMemory();
  if (entry?.addresses?.length) return entry.addresses;
  if (entry && Array.isArray(entry.addresses) && entry.addresses.length === 0) {
    // Explicit empty list from a prior successful fetch — don't invent rows.
    return entry.addresses;
  }
  return bootstrapAddressesFromSession();
}

/** Disk cache age for React Query staleTime — 0 if bootstrap-only / unknown. */
export function getCachedAddressesUpdatedAt(): number {
  const entry = ownedMemory();
  return entry?.cachedAt && entry.cachedAt > 0 ? entry.cachedAt : 0;
}

export async function hydrateAddressesFromStorage(): Promise<Address[] | undefined> {
  const sync = readSyncCachedAddresses();
  if (sync) return sync;
  try {
    await hydrateFastKvFromAsyncStorage([STORAGE_KEYS.ADDRESSES_CACHE]);
    memory = parse(fastGetString(STORAGE_KEYS.ADDRESSES_CACHE));
    return readSyncCachedAddresses();
  } catch {
    return bootstrapAddressesFromSession();
  }
}

export async function writeCachedAddresses(addresses: Address[]): Promise<void> {
  if (!Array.isArray(addresses)) return;
  const customerId = getActiveCustomerScopeId();
  const entry: CachedAddresses = {
    addresses,
    cachedAt: Date.now(),
    customerId,
  };
  memory = entry;
  try {
    fastSetString(STORAGE_KEYS.ADDRESSES_CACHE, JSON.stringify(entry));
  } catch {
    /* non-blocking */
  }
}

/** Merge one known address into disk + return the merged list. */
export function upsertCachedAddress(row: AddressLike): Address[] {
  const next = toAddress(row);
  const prev = ownedMemory()?.addresses ?? bootstrapAddressesFromSession() ?? [];
  const without = prev.filter((a) => a.id !== next.id);
  const merged = [
    { ...next, isSelected: true },
    ...without.map((a) => ({ ...a, isSelected: false })),
  ];
  void writeCachedAddresses(merged);
  return merged;
}

/** Seed / merge into React Query so Select location never waits on network. */
export function mergeAddressesIntoQuery(
  queryClient: QueryClient,
  rows: AddressLike[] | AddressLike
): Address[] {
  const list = Array.isArray(rows) ? rows : [rows];
  let merged = queryClient.getQueryData<Address[]>(ADDRESSES_QUERY_KEY) ?? readSyncCachedAddresses() ?? [];
  for (const row of list) {
    const next = toAddress(row);
    const without = merged.filter((a) => a.id !== next.id);
    merged = [next, ...without];
  }
  queryClient.setQueryData(ADDRESSES_QUERY_KEY, merged);
  void writeCachedAddresses(merged);
  return merged;
}

export function clearCachedAddresses(): void {
  memory = null;
  try {
    fastSetString(STORAGE_KEYS.ADDRESSES_CACHE, "");
  } catch {
    /* ignore */
  }
}

export function seedAddressesQuery(queryClient: QueryClient): void {
  const cached = readSyncCachedAddresses();
  if (!cached) return;
  const existing = queryClient.getQueryData<Address[]>(ADDRESSES_QUERY_KEY);
  // Prefer non-empty seed over an empty in-memory miss from a failed fetch.
  if (existing !== undefined && existing.length > 0) return;
  if (existing !== undefined && cached.length === 0) return;
  queryClient.setQueryData(ADDRESSES_QUERY_KEY, cached);
}

export async function hydrateAddressesQuery(queryClient: QueryClient): Promise<void> {
  seedAddressesQuery(queryClient);
  const existing = queryClient.getQueryData<Address[]>(ADDRESSES_QUERY_KEY);
  if (existing !== undefined && existing.length > 0) return;
  const cached = await hydrateAddressesFromStorage();
  if (cached) queryClient.setQueryData(ADDRESSES_QUERY_KEY, cached);
}

/**
 * Persist every RQ write (fetch + optimistic setQueryData) so the next open
 * never waits on network. Idempotent — safe to call once per QueryClient.
 */
export function subscribeAddressesCachePersistence(queryClient: QueryClient): void {
  if (subscribedQueryClient === queryClient) return;
  subscribedQueryClient = queryClient;
  queryClient.getQueryCache().subscribe((event) => {
    if (event?.type !== "updated") return;
    const key = event.query.queryKey;
    if (!Array.isArray(key) || key[0] !== "addresses") return;
    const data = event.query.state.data;
    if (!Array.isArray(data)) return;
    void writeCachedAddresses(data as Address[]);
  });
}
