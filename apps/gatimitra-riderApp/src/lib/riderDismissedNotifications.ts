/**
 * Local optimistic cache of cleared inbox notification IDs.
 * Server `notification_inbox_clears.cleared_at` is the source of truth;
 * this mirror only speeds UI and covers brief offline windows after a
 * successful Clear All. Keys are scoped per authenticated rider user id.
 */
import { getItem, setItem } from "@/src/utils/storage";
import { useSessionStore } from "@/src/stores/sessionStore";

const KEY_PREFIX = "rider_dismissed_notification_ids";
const LEGACY_KEY = "rider_dismissed_notification_ids";
const MAX_TRACKED = 500;

function scopedKey(userId?: string | null): string {
  const uid = String(userId ?? "").trim();
  return uid ? `${KEY_PREFIX}:${uid}` : LEGACY_KEY;
}

function currentUserId(): string | null {
  const session = useSessionStore.getState().session;
  const uid = String(session?.userId ?? "").trim();
  return uid || null;
}

export async function readRiderDismissedNotificationIds(
  userId?: string | null
): Promise<Set<string>> {
  const uid = userId === undefined ? currentUserId() : userId;
  const key = scopedKey(uid);
  const raw = await getItem(key);
  // One-time bridge from the pre-scoped device-global key for the active rider.
  if (!raw && uid) {
    const legacy = await getItem(LEGACY_KEY);
    if (legacy) {
      try {
        await setItem(key, legacy);
      } catch {
        /* ignore */
      }
      return parseIdSet(legacy);
    }
  }
  return parseIdSet(raw);
}

function parseIdSet(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string" && v.length > 0));
  } catch {
    return new Set();
  }
}

export async function addRiderDismissedNotificationIds(ids: string[]): Promise<void> {
  const uid = currentUserId();
  const key = scopedKey(uid);
  const current = await readRiderDismissedNotificationIds(uid);
  for (const id of ids) {
    const trimmed = String(id ?? "").trim();
    if (trimmed) current.add(trimmed);
  }
  const capped = [...current].slice(-MAX_TRACKED);
  await setItem(key, JSON.stringify(capped));
}
