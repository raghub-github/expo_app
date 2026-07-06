import type { WalletSummary } from '@/hooks/useMerchantApi';

const WALLET_SESSION_PREFIX = 'mx_dashboard_wallet_v1:';
const WALLET_LOCAL_PREFIX = 'mx_dashboard_wallet_v1_ls:';
const SESSION_TTL_MS = 15 * 60 * 1000;
const LOCAL_TTL_MS = 24 * 60 * 60 * 1000;

type CacheEnvelope<T> = { ts: number; data: T };

function readLayer<T>(sessionKey: string, localKey: string, sessionTtl: number, localTtl: number): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const sessionRaw = sessionStorage.getItem(sessionKey);
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw) as CacheEnvelope<T>;
      if (parsed?.data && Date.now() - parsed.ts <= sessionTtl) return parsed.data;
    }
    const localRaw = localStorage.getItem(localKey);
    if (localRaw) {
      const parsed = JSON.parse(localRaw) as CacheEnvelope<T>;
      if (parsed?.data && Date.now() - parsed.ts <= localTtl) return parsed.data;
    }
    return null;
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

export function readDashboardWalletCache(storeId: string): WalletSummary | null {
  const id = storeId.trim();
  if (!id) return null;
  return readLayer<WalletSummary>(
    `${WALLET_SESSION_PREFIX}${id}`,
    `${WALLET_LOCAL_PREFIX}${id}`,
    SESSION_TTL_MS,
    LOCAL_TTL_MS,
  );
}

export function writeDashboardWalletCache(storeId: string, data: WalletSummary) {
  const id = storeId.trim();
  if (!id) return;
  writeLayer(`${WALLET_SESSION_PREFIX}${id}`, `${WALLET_LOCAL_PREFIX}${id}`, data);
}

/** Fire-and-forget wallet warm — safe before React Query mounts. */
export function warmDashboardWalletCache(storeId: string): void {
  if (typeof window === 'undefined' || !storeId.trim()) return;
  if (readDashboardWalletCache(storeId)) return;
  void fetch(`/api/merchant/wallet?storeId=${encodeURIComponent(storeId)}&lite=1`, {
    credentials: 'include',
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (!data || data.error) return;
      writeDashboardWalletCache(storeId, {
        available_balance: data.available_balance ?? 0,
        locked_balance: 0,
        withdrawable_balance: data.withdrawable_balance ?? data.available_balance ?? 0,
        pending_balance: data.pending_balance ?? 0,
        hold_balance: data.hold_balance ?? 0,
        locked_settlement_total: 0,
        total_balance: data.total_balance,
        settlement_paused: data.settlement_paused === true,
        today_earning: data.today_earning ?? 0,
        yesterday_earning: data.yesterday_earning ?? 0,
        total_earned: data.total_earned ?? 0,
        total_withdrawn: data.total_withdrawn ?? 0,
        pending_withdrawal_total: data.pending_withdrawal_total ?? 0,
        in_process_withdrawal_total: data.in_process_withdrawal_total ?? 0,
      });
    })
    .catch(() => {
      /* ignore */
    });
}
