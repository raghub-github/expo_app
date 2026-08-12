/** Session cache so store-status / ops paint instantly on revisit (partnersite pattern). */

const KEY_PREFIX = "gm_dashboard_store_ops_cache_v1_";

export function readStoreOperationsCache(storeId: string): Record<string, unknown> | null {
  if (typeof window === "undefined" || !storeId) return null;
  try {
    const raw = sessionStorage.getItem(`${KEY_PREFIX}${storeId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function writeStoreOperationsCache(storeId: string, data: unknown): void {
  if (typeof window === "undefined" || !storeId || data == null) return;
  try {
    sessionStorage.setItem(`${KEY_PREFIX}${storeId}`, JSON.stringify(data));
  } catch {
    // ignore quota / private mode
  }
}

/** Last-known open/closed from dashboard local status engine (instant badge). */
export function readCachedStoreOpenFromEngine(storeId: string): boolean | null {
  if (typeof window === "undefined" || !storeId) return null;
  try {
    const raw = localStorage.getItem(`gm_dashboard_local_store_status_engine_${storeId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { store_status?: string };
    if (parsed.store_status === "ONLINE") return true;
    if (parsed.store_status === "OFFLINE") return false;
    return null;
  } catch {
    return null;
  }
}
