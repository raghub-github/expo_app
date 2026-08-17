import type { WalletSummary } from '@/hooks/useMerchantApi';

const WALLET_SESSION_PREFIX = 'mx_dashboard_wallet_v2:';
const WALLET_LOCAL_PREFIX = 'mx_dashboard_wallet_v2_ls:';
const DELIVERY_STATS_SESSION_PREFIX = 'mx_dashboard_delivery_stats_v1:';
const DELIVERY_STATS_LOCAL_PREFIX = 'mx_dashboard_delivery_stats_v1_ls:';
const STORE_OVERVIEW_SESSION_PREFIX = 'mx_dashboard_store_overview_v1:';
const STORE_OVERVIEW_LOCAL_PREFIX = 'mx_dashboard_store_overview_v1_ls:';
/** Align with store-ops / overview — short TTL made SWR placeholders useless. */
const WALLET_SESSION_TTL_MS = 15 * 60 * 1000;
const WALLET_LOCAL_TTL_MS = 24 * 60 * 60 * 1000;
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
    WALLET_SESSION_TTL_MS,
    WALLET_LOCAL_TTL_MS,
  );
}

export function writeDashboardWalletCache(storeId: string, data: WalletSummary) {
  const id = storeId.trim();
  if (!id) return;
  writeLayer(`${WALLET_SESSION_PREFIX}${id}`, `${WALLET_LOCAL_PREFIX}${id}`, data);
}

export function clearDashboardWalletCache(storeId: string) {
  const id = storeId.trim();
  if (!id || typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(`${WALLET_SESSION_PREFIX}${id}`);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(`${WALLET_LOCAL_PREFIX}${id}`);
  } catch {
    /* ignore */
  }
}

export type DashboardDeliveryStats = {
  activeOrders: number;
  avgPreparationTimeMinutes: number;
  completionRatePercent: number;
  deliveredTodayCount: number;
  cancelledTodayCount: number;
  rtoTodayCount: number;
};

export type DashboardStoreOverview = {
  total_products: number;
  out_of_stock: number;
  pending_orders: number;
};

export function readDashboardDeliveryStatsCache(storeId: string): DashboardDeliveryStats | null {
  const id = storeId.trim();
  if (!id) return null;
  return readLayer<DashboardDeliveryStats>(
    `${DELIVERY_STATS_SESSION_PREFIX}${id}`,
    `${DELIVERY_STATS_LOCAL_PREFIX}${id}`,
    SESSION_TTL_MS,
    LOCAL_TTL_MS,
  );
}

export function writeDashboardDeliveryStatsCache(storeId: string, data: DashboardDeliveryStats) {
  const id = storeId.trim();
  if (!id) return;
  writeLayer(`${DELIVERY_STATS_SESSION_PREFIX}${id}`, `${DELIVERY_STATS_LOCAL_PREFIX}${id}`, data);
}

export function readDashboardStoreOverviewCache(storeId: string): DashboardStoreOverview | null {
  const id = storeId.trim();
  if (!id) return null;
  return readLayer<DashboardStoreOverview>(
    `${STORE_OVERVIEW_SESSION_PREFIX}${id}`,
    `${STORE_OVERVIEW_LOCAL_PREFIX}${id}`,
    SESSION_TTL_MS,
    LOCAL_TTL_MS,
  );
}

export function writeDashboardStoreOverviewCache(storeId: string, data: DashboardStoreOverview) {
  const id = storeId.trim();
  if (!id) return;
  writeLayer(`${STORE_OVERVIEW_SESSION_PREFIX}${id}`, `${STORE_OVERVIEW_LOCAL_PREFIX}${id}`, data);
}

function parseDeliveryStatsBody(body: Record<string, unknown>): DashboardDeliveryStats {
  return {
    activeOrders: Number(body.activeOrders) || 0,
    avgPreparationTimeMinutes: Number(body.avgPreparationTimeMinutes) || 0,
    completionRatePercent: Number(body.completionRatePercent) || 0,
    deliveredTodayCount: Number(body.deliveredTodayCount) || 0,
    cancelledTodayCount: Number(body.cancelledTodayCount) || 0,
    rtoTodayCount: Number(body.returnFailedTodayCount ?? body.rtoTodayCount) || 0,
  };
}

function parseStoreOverviewBody(body: Record<string, unknown>): DashboardStoreOverview {
  return {
    total_products: Number(body.total_products) || 0,
    out_of_stock: Number(body.out_of_stock) || 0,
    pending_orders: Number(body.pending_orders) || 0,
  };
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
        isFrozen: data.isFrozen === true || String(data.status ?? "").toUpperCase() === "FROZEN",
        freezeReason: data.freezeReason ?? null,
        frozenAt: data.frozenAt ?? null,
      });
    })
    .catch(() => {
      /* ignore */
    });
}

/** Fire-and-forget delivery stats warm — safe before dashboard cards mount. */
export function warmDashboardDeliveryStatsCache(storeId: string): void {
  if (typeof window === 'undefined' || !storeId.trim()) return;
  if (readDashboardDeliveryStatsCache(storeId)) return;
  void fetch(`/api/food-orders/stats?store_id=${encodeURIComponent(storeId)}`, {
    credentials: 'include',
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      if (!body || typeof body !== 'object') return;
      writeDashboardDeliveryStatsCache(storeId, parseDeliveryStatsBody(body));
    })
    .catch(() => {
      /* ignore */
    });
}

/** Fire-and-forget store overview warm — safe before dashboard cards mount. */
export function warmDashboardStoreOverviewCache(storeId: string): void {
  if (typeof window === 'undefined' || !storeId.trim()) return;
  if (readDashboardStoreOverviewCache(storeId)) return;
  void fetch(`/api/merchant/store-overview?store_id=${encodeURIComponent(storeId)}`, {
    credentials: 'include',
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      if (!body || typeof body !== 'object') return;
      writeDashboardStoreOverviewCache(storeId, parseStoreOverviewBody(body));
    })
    .catch(() => {
      /* ignore */
    });
}

/** Warm all dashboard card caches for the active outlet. */
export function warmDashboardCardCaches(storeId: string): void {
  warmDashboardWalletCache(storeId);
  warmDashboardDeliveryStatsCache(storeId);
  warmDashboardStoreOverviewCache(storeId);
}
