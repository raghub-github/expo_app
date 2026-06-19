import type { WalletSummary } from '@/hooks/useMerchantApi';

const WALLET_PREFIX = 'mx_dashboard_wallet_v1:';
const TTL_MS = 15 * 60 * 1000;

type CacheEnvelope<T> = { ts: number; data: T };

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed?.data || Date.now() - parsed.ts > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function write<T>(key: string, data: T) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data } satisfies CacheEnvelope<T>));
  } catch {
    /* ignore */
  }
}

export function readDashboardWalletCache(storeId: string): WalletSummary | null {
  return read(`${WALLET_PREFIX}${storeId}`);
}

export function writeDashboardWalletCache(storeId: string, data: WalletSummary) {
  write(`${WALLET_PREFIX}${storeId}`, data);
}
