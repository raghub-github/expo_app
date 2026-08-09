'use client';

import { Suspense, useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import {
  isValidPartnerStoreId,
  PARTNER_PENDING_ORDERS_REFRESH,
  PARTNER_SELECTED_STORE_CHANGED,
  readPartnerSelectedStoreId,
  usePartnerSelectedStore,
} from '@/lib/partner-selected-store';
import { invalidatePartnerPendingCountCache } from '@/lib/partner-pending-count-fetch';
import {
  clearPartnerAcceptanceTimeoutSyncCache,
  requestPartnerAcceptanceTimeoutSync,
} from '@/lib/partner-acceptance-timeout-sync-client';
import { useMerchantSession } from '@/context/MerchantSessionContext';

function PartnerAcceptanceTimeoutSyncInner({ restaurantId }: { restaurantId?: string }) {
  const merchantSession = useMerchantSession();
  const { storeId, ready: storeReady } = usePartnerSelectedStore(restaurantId);
  const runningRef = useRef(false);
  const sessionReady =
    !!merchantSession && !merchantSession.isLoading && merchantSession.isAuthenticated;

  const runSync = useCallback(async () => {
    if (!sessionReady) return;
    const sid = storeId || readPartnerSelectedStoreId(restaurantId);
    if (!isValidPartnerStoreId(sid)) return;
    if (runningRef.current) return;

    runningRef.current = true;
    try {
      const result = await requestPartnerAcceptanceTimeoutSync(sid);
      if (result.ok && result.cancelled > 0) {
        const cancelled = result.cancelled;
        const msg =
          cancelled === 1
            ? '1 order was auto-cancelled (acceptance window expired)'
            : `${cancelled} orders were auto-cancelled (acceptance window expired)`;
        toast.info(msg, { duration: 8000 });
        invalidatePartnerPendingCountCache();
        window.dispatchEvent(new CustomEvent(PARTNER_PENDING_ORDERS_REFRESH));
        window.dispatchEvent(new CustomEvent('partner-incoming-order-rescan'));
        window.dispatchEvent(new CustomEvent('partner-food-orders-refresh'));
      }
    } catch {
      /* ignore */
    } finally {
      runningRef.current = false;
    }
  }, [restaurantId, sessionReady, storeId]);

  useEffect(() => {
    if (!storeReady || !sessionReady) return;
    const t = window.setTimeout(() => {
      void runSync();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [storeReady, sessionReady, runSync]);

  useEffect(() => {
    const onStore = () => {
      const sid = readPartnerSelectedStoreId(restaurantId);
      if (!isValidPartnerStoreId(sid)) return;
      clearPartnerAcceptanceTimeoutSyncCache(sid);
      void runSync();
    };
    window.addEventListener(PARTNER_SELECTED_STORE_CHANGED, onStore);
    return () => window.removeEventListener(PARTNER_SELECTED_STORE_CHANGED, onStore);
  }, [restaurantId, runSync]);

  return null;
}

export function PartnerAcceptanceTimeoutSync(props: { restaurantId?: string }) {
  return (
    <Suspense fallback={null}>
      <PartnerAcceptanceTimeoutSyncInner {...props} />
    </Suspense>
  );
}
