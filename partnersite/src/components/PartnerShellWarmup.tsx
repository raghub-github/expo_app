'use client';

import { useLayoutEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { merchantKeys } from '@/lib/query-keys';
import { readPartnerSelectedStoreId } from '@/lib/partner-selected-store';
import { warmDashboardCardCaches } from '@/lib/partner-dashboard-cache';
import { warmLivePreviewCache } from '@/lib/merchant-growth/growth-insights-cache';
import { prefetchPartnerRouteData } from '@/lib/partner-route-prefetch';
import { loadMerchantAppAssets, MX_ASSET, getMerchantAppAssetUrl } from '@/lib/merchantAppAssets';
import { MerchantOrderEmptyAssetsWarmup } from '@/components/MerchantAppAssetImage';

const EMPTY_ORDER_KEYS = [
  MX_ASSET.ordersEmptyNew,
  MX_ASSET.ordersEmptyActive,
  MX_ASSET.ordersEmptyPreparing,
  MX_ASSET.ordersEmptyReady,
  MX_ASSET.ordersEmptyPickedUp,
  MX_ASSET.ordersEmptyCompleted,
  MX_ASSET.ordersEmptyRto,
  MX_ASSET.ordersEmptyScheduled,
] as const;

function prefetchEmptyOrderImages(): void {
  if (typeof window === 'undefined') return;
  for (const key of EMPTY_ORDER_KEYS) {
    const url = getMerchantAppAssetUrl(key);
    if (!url) continue;
    const img = new window.Image();
    img.decoding = 'async';
    img.fetchPriority = 'high';
    img.src = url;
  }
}

/**
 * Warms shared partner caches once per session so first tab switches feel instant.
 */
export function PartnerShellWarmup() {
  const queryClient = useQueryClient();

  useLayoutEffect(() => {
    const storeId = readPartnerSelectedStoreId();
    if (storeId) {
      warmDashboardCardCaches(storeId);
      warmLivePreviewCache(storeId, 'today');
    }

    void loadMerchantAppAssets()
      .then(() => prefetchEmptyOrderImages())
      .catch(() => undefined);

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
      // Warm dashboard first; other routes prefetch on hover/navigation.
      prefetchPartnerRouteData(queryClient, '/partners/dashboard', storeId);
    }
  }, [queryClient]);

  return <MerchantOrderEmptyAssetsWarmup />;
}
