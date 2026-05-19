/**
 * Device-local dedupe for partner order accept/reject toasts.
 * Prevents the same order from showing "Order accepted" / "Order rejected" again
 * when the dashboard is reopened or multiple modal instances fire the same action.
 */

const STORAGE_KEY = 'partner_order_action_toast_v1';
const MAX_ENTRIES = 400;
const TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type PartnerOrderActionToastKind = 'accepted' | 'rejected';

type StoredEntry = { key: string; t: number };

function toastKey(orderId: number, kind: PartnerOrderActionToastKind): string {
  return `${orderId}:${kind}`;
}

function readEntries(): StoredEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (e): e is StoredEntry =>
        !!e &&
        typeof e === 'object' &&
        typeof (e as StoredEntry).key === 'string' &&
        typeof (e as StoredEntry).t === 'number' &&
        now - (e as StoredEntry).t < TTL_MS
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: StoredEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    /* ignore quota */
  }
}

export function hasShownPartnerOrderActionToast(
  orderId: number,
  kind: PartnerOrderActionToastKind
): boolean {
  const key = toastKey(orderId, kind);
  return readEntries().some((e) => e.key === key);
}

export function markPartnerOrderActionToastShown(
  orderId: number,
  kind: PartnerOrderActionToastKind
): void {
  const key = toastKey(orderId, kind);
  const entries = readEntries().filter((e) => e.key !== key);
  entries.push({ key, t: Date.now() });
  writeEntries(entries);
}
