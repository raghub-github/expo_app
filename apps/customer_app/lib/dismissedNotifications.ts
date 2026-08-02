/**
 * Notification inbox rows (/v1/notifications/inbox) are delivery audit records and
 * cannot be deleted server-side. Persist the user's deletions on the device so a
 * deleted notification does not come back on the next inbox load.
 */
import { STORAGE_KEYS } from "@/constants";
import { getItem, setItem, removeItem } from "@/utils/storage";

const MAX_TRACKED = 500;

export async function readDismissedNotificationIds(): Promise<Set<string>> {
  const raw = await getItem(STORAGE_KEYS.DISMISSED_NOTIFICATIONS);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string" && v.length > 0));
  } catch {
    return new Set();
  }
}

export async function addDismissedNotificationIds(ids: string[]): Promise<Set<string>> {
  const current = await readDismissedNotificationIds();
  for (const id of ids) {
    const trimmed = String(id ?? "").trim();
    if (trimmed) current.add(trimmed);
  }
  // Keep the newest entries; older campaigns drop out of the inbox window anyway.
  const capped = [...current].slice(-MAX_TRACKED);
  await setItem(STORAGE_KEYS.DISMISSED_NOTIFICATIONS, JSON.stringify(capped));
  return new Set(capped);
}

export async function clearDismissedNotificationIds(): Promise<void> {
  await removeItem(STORAGE_KEYS.DISMISSED_NOTIFICATIONS);
}
