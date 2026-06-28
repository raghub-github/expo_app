'use client';

import type { QueryClient } from '@tanstack/react-query';
import { merchantKeys } from '@/lib/query-keys';
import { fetchStoreOperations } from '@/hooks/useMerchantApi';
import { mapInsightsDatePreset } from '@/components/merchant/LivePreviewInsightsPanel';
import { prefetchGrowthInsights } from '@/lib/merchant-growth/growth-insights-cache';
import { prefetchStoreOperationsPanel } from '@/lib/store-operations-panel-cache';
import { prefetchMerchantProfile } from '@/lib/merchant-profile-cache';

async function fetchWalletForStore(storeId: string) {
  const res = await fetch(`/api/merchant/wallet?storeId=${encodeURIComponent(storeId)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

async function fetchFoodOrdersForStore(storeId: string) {
  const res = await fetch(`/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=200`, {
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data.orders)) {
    throw new Error(data.error ?? 'Failed to prefetch orders');
  }
  return data.orders;
}

async function fetchOrderHistoryForStore(storeId: string) {
  const res = await fetch(`/api/food-orders?store_id=${encodeURIComponent(storeId)}&limit=500`, {
    credentials: 'include',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !Array.isArray(data.orders)) {
    throw new Error(data.error ?? 'Failed to prefetch order history');
  }
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
      queryKey: merchantKeys.wallet(storeId),
      queryFn: () => fetchWalletForStore(storeId),
      staleTime: 2 * 60 * 1000,
    });
    void queryClient.prefetchQuery({
      queryKey: merchantKeys.storeOperations(storeId),
      queryFn: () => fetchStoreOperations(storeId),
      staleTime: 2 * 60 * 1000,
    });
    prefetchGrowthInsights(storeId, mapInsightsDatePreset('today'), mapInsightsDatePreset('today'));
    return;
  }

  if (path.includes('/orders') && !path.includes('order-history')) {
    void queryClient.prefetchQuery({
      queryKey: merchantKeys.foodOrders(storeId),
      queryFn: () => fetchFoodOrdersForStore(storeId),
      staleTime: 15 * 1000,
    });
    return;
  }

  if (path.includes('/order-history')) {
    void queryClient.prefetchQuery({
      queryKey: merchantKeys.orderHistory(storeId),
      queryFn: () => fetchOrderHistoryForStore(storeId),
      staleTime: 30 * 1000,
    });
    return;
  }

  if (path.includes('/store-settings')) {
    void prefetchStoreOperationsPanel(storeId);
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
