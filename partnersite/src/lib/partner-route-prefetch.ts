'use client';

import type { QueryClient } from '@tanstack/react-query';
import { merchantKeys } from '@/lib/query-keys';
import { fetchStoreOperations } from '@/hooks/useMerchantApi';
import { mapInsightsDatePreset } from '@/components/merchant/LivePreviewInsightsPanel';
import { prefetchLivePreview } from '@/lib/merchant-growth/growth-insights-cache';
import { prefetchStoreOperationsPanel } from '@/lib/store-operations-panel-cache';
import { prefetchMerchantProfile } from '@/lib/merchant-profile-cache';
import { prefetchPlanUsage } from '@/lib/plan-usage-cache';
import {
  writeDashboardDeliveryStatsCache,
  writeDashboardStoreOverviewCache,
  writeDashboardWalletCache,
} from '@/lib/partner-dashboard-cache';
import type { WalletSummary } from '@/hooks/useMerchantApi';

const PREFETCH_FETCH_TIMEOUT_MS = 18_000;

async function prefetchFetch(input: string, init?: RequestInit): Promise<Response | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PREFETCH_FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, {
      ...init,
      credentials: init?.credentials ?? 'include',
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fetchWalletForStore(storeId: string, lite = true): Promise<WalletSummary> {
  const res = await prefetchFetch(
    `/api/merchant/wallet?storeId=${encodeURIComponent(storeId)}&lite=${lite ? '1' : '0'}`,
  );
  if (!res?.ok) throw new Error('Failed to prefetch wallet');
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  const summary: WalletSummary = {
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
  };
  writeDashboardWalletCache(storeId, summary);
  return summary;
}

async function fetchFoodOrdersForStore(storeId: string) {
  const res = await prefetchFetch(
    `/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=200&skip_compensation=1`,
  );
  if (!res?.ok) return [];
  const data = await res.json().catch(() => ({}));
  if (!Array.isArray(data.orders)) return [];
  return data.orders;
}

async function fetchOrderHistoryForStore(storeId: string) {
  const res = await prefetchFetch(
    `/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=200&skip_compensation=1`,
  );
  if (!res?.ok) return [];
  const data = await res.json().catch(() => ({}));
  if (!Array.isArray(data.orders)) return [];
  return data.orders;
}

/** Warm React Query cache when hovering sidebar links. */
export function prefetchPartnerRouteData(
  queryClient: QueryClient,
  href: string,
  storeId: string | null | undefined
): void {
  if (!storeId) return;
  const path = href.split('?')[0];

  if (path.includes('/dashboard')) {
    void queryClient.prefetchQuery({
      queryKey: merchantKeys.storeRecord(storeId),
      queryFn: async () => {
        const { fetchPartnerStoreRecord } = await import('@/lib/partner-store-record-fetch');
        return fetchPartnerStoreRecord(storeId);
      },
      staleTime: 5 * 60 * 1000,
    });
    void queryClient.prefetchQuery({
      queryKey: [...merchantKeys.wallet(storeId), 'lite'],
      queryFn: () => fetchWalletForStore(storeId),
      staleTime: 5 * 60 * 1000,
    });
    void queryClient.prefetchQuery({
      queryKey: merchantKeys.storeOperations(storeId),
      queryFn: () => fetchStoreOperations(storeId),
      staleTime: 3 * 60 * 1000,
    });
    prefetchLivePreview(storeId, mapInsightsDatePreset('today'));
    void prefetchFetch(`/api/food-orders/stats?store_id=${encodeURIComponent(storeId)}`)
      .then((res) => (res?.ok ? res.json() : null))
      .then((body) => {
        if (!body || typeof body !== 'object') return;
        writeDashboardDeliveryStatsCache(storeId, {
          activeOrders: Number(body.activeOrders) || 0,
          avgPreparationTimeMinutes: Number(body.avgPreparationTimeMinutes) || 0,
          completionRatePercent: Number(body.completionRatePercent) || 0,
          deliveredTodayCount: Number(body.deliveredTodayCount) || 0,
          cancelledTodayCount: Number(body.cancelledTodayCount) || 0,
          rtoTodayCount: Number(body.returnFailedTodayCount ?? body.rtoTodayCount) || 0,
        });
      })
      .catch(() => {
        /* ignore */
      });
    void prefetchFetch(`/api/merchant/store-overview?store_id=${encodeURIComponent(storeId)}`)
      .then((res) => (res?.ok ? res.json() : null))
      .then((body) => {
        if (!body || typeof body !== 'object') return;
        writeDashboardStoreOverviewCache(storeId, {
          total_products: Number(body.total_products) || 0,
          out_of_stock: Number(body.out_of_stock) || 0,
          pending_orders: Number(body.pending_orders) || 0,
        });
      })
      .catch(() => {
        /* ignore */
      });
    return;
  }

  if (path.includes('/orders') && !path.includes('order-history')) {
    void queryClient.prefetchQuery({
      queryKey: merchantKeys.foodOrders(storeId),
      queryFn: () => fetchFoodOrdersForStore(storeId),
      staleTime: 15 * 1000,
      retry: false,
    });
    return;
  }

  if (path.includes('/order-history')) {
    void queryClient.prefetchQuery({
      queryKey: merchantKeys.orderHistory(storeId),
      queryFn: () => fetchOrderHistoryForStore(storeId),
      staleTime: 30 * 1000,
      retry: false,
    });
    return;
  }

  if (path.includes('/payments')) {
    void queryClient.prefetchQuery({
      queryKey: merchantKeys.storeRecord(storeId),
      queryFn: async () => {
        const { fetchPartnerStoreRecord } = await import('@/lib/partner-store-record-fetch');
        return fetchPartnerStoreRecord(storeId);
      },
      staleTime: 5 * 60 * 1000,
    });
    void queryClient.prefetchQuery({
      queryKey: [...merchantKeys.wallet(storeId), 'full'],
      queryFn: () => fetchWalletForStore(storeId, false),
      staleTime: 5 * 60 * 1000,
    });
    void queryClient.prefetchQuery({
      queryKey: merchantKeys.payoutRequests(storeId, 5),
      queryFn: async () => {
        const res = await prefetchFetch(
          `/api/merchant/payout-requests?storeId=${encodeURIComponent(storeId)}&limit=5`,
        );
        if (!res?.ok) throw new Error('Failed to load payouts');
        const data = await res.json();
        if (data.error) throw new Error(data.error ?? 'Failed to load payouts');
        return {
          summary: data.summary ?? { paid: 0, in_process: 0, pending: 0, failed: 0, total: 0 },
          recent: Array.isArray(data.recent) ? data.recent : [],
        };
      },
      staleTime: 45 * 1000,
    });
    return;
  }

  if (path.includes('/store-settings')) {
    void prefetchStoreOperationsPanel(storeId);
    prefetchPlanUsage(storeId);
    return;
  }

  if (path.includes('/profile')) {
    void prefetchMerchantProfile(storeId);
    return;
  }

  void queryClient.prefetchQuery({
    queryKey: merchantKeys.storeRecord(storeId),
    queryFn: async () => {
      const { fetchPartnerStoreRecord } = await import('@/lib/partner-store-record-fetch');
      return fetchPartnerStoreRecord(storeId);
    },
    staleTime: 5 * 60 * 1000,
  });
}
