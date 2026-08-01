/**
 * Persist active person-ride order refs so the Book a Ride Track pill
 * survives force-close / cold start before my-orders refetch completes.
 */
import { STORAGE_KEYS } from "@/constants";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";
import { getActiveCustomerScopeId, isOwnedByActiveCustomer } from "@/lib/customerScope";

const KEY = STORAGE_KEYS.ACTIVE_PERSON_RIDE_IDS;

let memoryIds: string[] | null = null;

function normalizeId(orderId: string | null | undefined): string {
  return String(orderId ?? "").trim();
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.map((x) => normalizeId(typeof x === "string" ? x : "")).filter(Boolean)
    ),
  ];
}

/**
 * Ride ids hydrate the Track pill before any network call, so a payload that is
 * not stamped with the signed-in customer is dropped rather than trusted. The
 * legacy bare-array shape carries no owner and is therefore discarded.
 */
function parse(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return [];
    const entry = parsed as { customerId?: string | null; ids?: unknown } | null;
    if (!entry || !isOwnedByActiveCustomer(entry.customerId)) return [];
    return normalizeIds(entry.ids);
  } catch {
    return [];
  }
}

function hydrateMemorySync(): void {
  if (memoryIds) return;
  memoryIds = parse(fastGetString(KEY));
}

function persist(ids: string[]): void {
  memoryIds = ids;
  try {
    fastSetString(KEY, JSON.stringify({ customerId: getActiveCustomerScopeId(), ids }));
  } catch {
    /* non-blocking */
  }
}

hydrateMemorySync();
void hydrateFastKvFromAsyncStorage([KEY]).then(() => {
  memoryIds = null;
  hydrateMemorySync();
});

export function readActivePersonRideIds(): string[] {
  hydrateMemorySync();
  return memoryIds ? [...memoryIds] : [];
}

export function rememberActivePersonRide(orderId: string | null | undefined): void {
  const id = normalizeId(orderId);
  if (!id) return;
  hydrateMemorySync();
  const prev = memoryIds ?? [];
  if (prev[0] === id) return;
  if (prev.includes(id)) {
    persist([id, ...prev.filter((x) => x !== id)].slice(0, 10));
    return;
  }
  persist([id, ...prev].slice(0, 10));
}

export function forgetActivePersonRide(orderId: string | null | undefined): void {
  const id = normalizeId(orderId);
  if (!id) return;
  hydrateMemorySync();
  const prev = memoryIds ?? [];
  if (!prev.includes(id)) return;
  persist(prev.filter((x) => x !== id));
}

export function clearActivePersonRideIds(): void {
  persist([]);
}
