import type { BillingDataset } from "./types.js";

type Entry = { dataset: BillingDataset; expiresAt: number };

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 200;

const store = new Map<string, Entry>();

export function billingDatasetCacheKey(
  rulesetVersion: number,
  merchantStoreId: number,
  couponCode: string | null,
  serviceType: string
): string {
  const c = (couponCode ?? "").trim().toLowerCase();
  const st = (serviceType ?? "FOOD").trim().toUpperCase();
  return `${rulesetVersion}|${merchantStoreId}|${c}|${st}`;
}

/** In-process cache keyed by ruleset_version + merchant + coupon (invalidates when version bumps). */
export function getCachedBillingDataset(key: string): BillingDataset | null {
  const e = store.get(key);
  if (!e || Date.now() > e.expiresAt) {
    if (e) store.delete(key);
    return null;
  }
  return e.dataset;
}

export function setCachedBillingDataset(key: string, dataset: BillingDataset, ttlMs = DEFAULT_TTL_MS): void {
  if (store.size >= MAX_ENTRIES) {
    const firstKey = store.keys().next().value;
    if (firstKey != null) store.delete(firstKey);
  }
  store.set(key, { dataset, expiresAt: Date.now() + ttlMs });
}

export function clearBillingRuleCache(): void {
  store.clear();
}
