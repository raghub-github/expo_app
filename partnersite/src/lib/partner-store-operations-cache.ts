import type { StoreOperationsData } from '@/hooks/useMerchantApi';

const SESSION_PREFIX = 'mx_store_ops_v1:';
const LOCAL_PREFIX = 'mx_store_ops_v1_ls:';
const SESSION_TTL_MS = 15 * 60 * 1000;
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = { ts: number; data: T };

function readLayer<T>(key: string, ttlMs: number): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.data || Date.now() - parsed.ts > ttlMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeLayer<T>(sessionKey: string, localKey: string, data: T) {
  if (typeof window === 'undefined') return;
  const envelope = JSON.stringify({ ts: Date.now(), data } satisfies CacheEnvelope<T>);
  try {
    sessionStorage.setItem(sessionKey, envelope);
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(localKey, envelope);
  } catch {
    /* ignore */
  }
}

export function readStoreOperationsCache(storeId: string): StoreOperationsData | null {
  const id = storeId.trim();
  if (!id) return null;
  return (
    readLayer<StoreOperationsData>(`${SESSION_PREFIX}${id}`, SESSION_TTL_MS) ??
    readLayer<StoreOperationsData>(`${LOCAL_PREFIX}${id}`, LOCAL_TTL_MS)
  );
}

export function writeStoreOperationsCache(storeId: string, data: StoreOperationsData) {
  const id = storeId.trim();
  if (!id) return;
  writeLayer(`${SESSION_PREFIX}${id}`, `${LOCAL_PREFIX}${id}`, data);
}
