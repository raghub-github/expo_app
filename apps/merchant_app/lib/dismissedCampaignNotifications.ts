/**
 * Campaign / announcement inbox rows are audit logs on the backend — they cannot
 * be deleted server-side. Persist the merchant's dismissals per device so a
 * deleted row does not reappear on the next inbox fetch.
 */
import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "merchant_dismissed_campaign_notifications_v1";
const MAX_TRACKED = 500;

export async function readDismissedCampaignIds(): Promise<Set<string>> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string" && v.length > 0));
  } catch {
    return new Set();
  }
}

export async function addDismissedCampaignId(id: string): Promise<void> {
  const trimmed = String(id ?? "").trim();
  if (!trimmed) return;
  await addDismissedCampaignIds([trimmed]);
}

export async function addDismissedCampaignIds(ids: string[]): Promise<void> {
  const cleaned = ids
    .map((id) => String(id ?? "").trim())
    .filter((id) => id.length > 0);
  if (cleaned.length === 0) return;
  try {
    const current = await readDismissedCampaignIds();
    for (const id of cleaned) current.add(id);
    // Keep newest entries; old campaigns fall out of the inbox window anyway.
    const capped = [...current].slice(-MAX_TRACKED);
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    /* dismissal is best-effort */
  }
}

export async function clearDismissedCampaignIds(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
