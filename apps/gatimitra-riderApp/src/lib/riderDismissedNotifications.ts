import { getItem, setItem } from "@/src/utils/storage";

const KEY = "rider_dismissed_notification_ids";
const MAX_TRACKED = 500;

export async function readRiderDismissedNotificationIds(): Promise<Set<string>> {
  const raw = await getItem(KEY);
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
  const current = await readRiderDismissedNotificationIds();
  for (const id of ids) {
    const trimmed = String(id ?? "").trim();
    if (trimmed) current.add(trimmed);
  }
  const capped = [...current].slice(-MAX_TRACKED);
  await setItem(KEY, JSON.stringify(capped));
}
