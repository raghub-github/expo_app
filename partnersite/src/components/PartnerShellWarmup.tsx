'use client';

import { useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { merchantKeys } from '@/lib/query-keys';
import { readPartnerSelectedStoreId } from '@/lib/partner-selected-store';
import { warmDashboardWalletCache } from '@/lib/partner-dashboard-cache';
import { warmLivePreviewCache } from '@/lib/merchant-growth/growth-insights-cache';
import { prefetchPartnerRouteData } from '@/lib/partner-route-prefetch';

/**
 * Warms shared partner caches once per session so first tab switches feel instant.
 */
export function PartnerShellWarmup() {
  const queryClient = useQueryClient();

  useLayoutEffect(() => {
    const storeId = readPartnerSelectedStoreId();
    if (storeId) {
      warmDashboardWalletCache(storeId);
      warmLivePreviewCache(storeId, 'today');
    }

    void queryClient.prefetchQuery({
      queryKey: merchantKeys.resolveSession(),
      queryFn: async () => {
        const res = await fetch('/api/merchant-auth/resolve-session', { credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error ?? 'resolve-session failed');
        return data;
      },
      staleTime: 5 * 60 * 1000,
    });

    if (storeId) {
      prefetchPartnerRouteData(queryClient, '/partners/dashboard', storeId);
      prefetchPartnerRouteData(queryClient, '/partners/payments', storeId);
      prefetchPartnerRouteData(queryClient, '/partners/orders', storeId);
      prefetchPartnerRouteData(queryClient, '/partners/order-history', storeId);
      prefetchPartnerRouteData(queryClient, '/partners/store-settings?tab=operations', storeId);
      prefetchPartnerRouteData(queryClient, '/partners/profile', storeId);
    }
  }, [queryClient]);

  return null;
}
