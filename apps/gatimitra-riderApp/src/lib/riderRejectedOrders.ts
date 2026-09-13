import { getItem, setItem } from "@/src/utils/storage";

const STORAGE_KEY = "rider_rejected_orders_v1";
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type StoredEntry = { orderId: string; rejectedAt: number };

async function readEntries(): Promise<StoredEntry[]> {
  try {
    const raw = await getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredEntry[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (e) =>
        e &&
        typeof e.orderId === "string" &&
        e.orderId.length > 0 &&
        typeof e.rejectedAt === "number" &&
        now - e.rejectedAt < MAX_AGE_MS
    );
  } catch {
    return [];
  }
}

async function writeEntries(entries: StoredEntry[]): Promise<void> {
  await setItem(STORAGE_KEY, JSON.stringify(entries));
}

export async function loadRiderRejectedOrderIds(): Promise<string[]> {
  const entries = await readEntries();
  return entries.map((e) => e.orderId);
}

export async function persistRiderRejectedOrderId(orderId: string): Promise<void> {
  const entries = await readEntries();
  const id = orderId.trim();
  if (!id) return;
  if (entries.some((e) => e.orderId === id)) return;
  entries.push({ orderId: id, rejectedAt: Date.now() });
  await writeEntries(entries);
}

/** Persist both internal + formatted ids so pool filters never miss a reject. */
export async function persistRiderRejectedOrderIds(ids: Array<string | null | undefined>): Promise<void> {
  const unique = [...new Set(ids.map((x) => String(x || "").trim()).filter(Boolean))];
  for (const id of unique) {
    await persistRiderRejectedOrderId(id);
  }
}

/** Drop rejected ids that are no longer in the dispatch pool. */
export async function pruneRiderRejectedOrderIds(liveOrderIds: Set<string>): Promise<boolean> {
  const entries = await readEntries();
  const next = entries.filter((e) => liveOrderIds.has(e.orderId));
  if (next.length === entries.length) return false;
  await writeEntries(next);
  return true;
}
