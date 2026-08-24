/** Sync store-type helpers for menu forms (no network). */

export function normalizeStoreType(storeType: string | null | undefined): string {
  return (storeType ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

export function isGroceryStoreType(storeType: string | null | undefined): boolean {
  return normalizeStoreType(storeType) === "GROCERY";
}

export function itemFormVariantForStoreType(
  storeType: string | null | undefined
): "grocery" | "standard" {
  return isGroceryStoreType(storeType) ? "grocery" : "standard";
}

const STORE_TYPE_CACHE_PREFIX = "mx_menu_store_type:";

export function readCachedStoreType(storeKey: string): string | null {
  if (typeof window === "undefined" || !storeKey) return null;
  try {
    const v = window.sessionStorage.getItem(STORE_TYPE_CACHE_PREFIX + storeKey);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

export function writeCachedStoreType(storeKey: string, storeType: string | null | undefined): void {
  if (typeof window === "undefined" || !storeKey) return;
  const t = normalizeStoreType(storeType);
  if (!t) return;
  try {
    window.sessionStorage.setItem(STORE_TYPE_CACHE_PREFIX + storeKey, t);
  } catch {
    /* ignore */
  }
}
