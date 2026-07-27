/**
 * Persist active person-ride order refs so the Book a Ride Track pill
 * survives force-close / cold start before my-orders refetch completes.
 */
import { STORAGE_KEYS } from "@/constants";
import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";

const KEY = STORAGE_KEYS.ACTIVE_PERSON_RIDE_IDS;

let memoryIds: string[] | null = null;

function normalizeId(orderId: string | null | undefined): string {
  return String(orderId ?? "").trim();
}

function parse(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed
          .map((x) => normalizeId(typeof x === "string" ? x : ""))
          .filter(Boolean)
      ),
    ];
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
    fastSetString(KEY, JSON.stringify(ids));
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
