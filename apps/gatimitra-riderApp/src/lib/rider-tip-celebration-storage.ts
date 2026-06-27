import { getItem, setItem } from "@/src/utils/storage";

const CELEBRATED_LEDGER_IDS_KEY = "rider_celebrated_tip_ledger_v1";
const ORDER_TIP_BASELINES_KEY = "rider_order_tip_baseline_v1";
const MAX_BASELINE_AGE_MS = 14 * 24 * 60 * 60 * 1000;

type BaselineEntry = {
  orderIds: string[];
  tipAmount: number;
  recordedAt: number;
};

function normalizeOrderIds(...ids: (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = raw?.trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (!out.some((v) => v.toLowerCase() === key)) out.push(id);
  }
  return out;
}

async function readCelebratedIds(): Promise<number[]> {
  try {
    const raw = await getItem(CELEBRATED_LEDGER_IDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
  } catch {
    return [];
  }
}

async function writeCelebratedIds(ids: number[]): Promise<void> {
  const unique = [...new Set(ids.filter((id) => Number.isFinite(id) && id > 0))].slice(-500);
  await setItem(CELEBRATED_LEDGER_IDS_KEY, JSON.stringify(unique));
}

export async function loadCelebratedTipLedgerIds(): Promise<Set<number>> {
  return new Set(await readCelebratedIds());
}

export async function markTipLedgerEntryCelebrated(entryId: number): Promise<void> {
  const ids = await readCelebratedIds();
  if (ids.includes(entryId)) return;
  ids.push(entryId);
  await writeCelebratedIds(ids);
}

export async function markTipLedgerEntriesCelebrated(entryIds: number[]): Promise<void> {
  const ids = await readCelebratedIds();
  let changed = false;
  for (const entryId of entryIds) {
    if (!Number.isFinite(entryId) || entryId <= 0 || ids.includes(entryId)) continue;
    ids.push(entryId);
    changed = true;
  }
  if (changed) await writeCelebratedIds(ids);
}

async function readBaselines(): Promise<BaselineEntry[]> {
  try {
    const raw = await getItem(ORDER_TIP_BASELINES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BaselineEntry[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (row) =>
        row &&
        Array.isArray(row.orderIds) &&
        row.orderIds.length > 0 &&
        typeof row.recordedAt === "number" &&
        now - row.recordedAt < MAX_BASELINE_AGE_MS
    );
  } catch {
    return [];
  }
}

async function writeBaselines(entries: BaselineEntry[]): Promise<void> {
  await setItem(ORDER_TIP_BASELINES_KEY, JSON.stringify(entries));
}

export async function recordOrderTipBaseline(
  orderId: string,
  tipAmount: number,
  extraOrderIds: string[] = []
): Promise<void> {
  const orderIds = normalizeOrderIds(orderId, ...extraOrderIds);
  if (orderIds.length === 0) return;

  const entries = await readBaselines();
  const tip = Math.max(0, Math.round(Number(tipAmount) || 0));
  const keys = new Set(orderIds.map((id) => id.toLowerCase()));

  const without = entries.filter(
    (row) => !row.orderIds.some((id) => keys.has(id.toLowerCase()))
  );
  without.push({
    orderIds,
    tipAmount: tip,
    recordedAt: Date.now(),
  });
  await writeBaselines(without);
}

export async function getOrderTipBaseline(orderId: string): Promise<number> {
  const id = orderId.trim();
  if (!id) return 0;
  const key = id.toLowerCase();
  const entries = await readBaselines();
  const hit = entries.find((row) =>
    row.orderIds.some((stored) => stored.toLowerCase() === key)
  );
  return hit ? Math.max(0, Math.round(hit.tipAmount)) : 0;
}
