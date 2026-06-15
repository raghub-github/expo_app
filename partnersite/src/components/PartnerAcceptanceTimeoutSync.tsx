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

const SYNC_SESSION_PREFIX = 'partner-acceptance-sync:';

function syncSessionKey(storeId: string): string {
  return `${SYNC_SESSION_PREFIX}${storeId.trim()}`;
}

function PartnerAcceptanceTimeoutSyncInner({ restaurantId }: { restaurantId?: string }) {
  const { storeId, ready: storeReady } = usePartnerSelectedStore(restaurantId);
  const runningRef = useRef(false);

  const runSync = useCallback(async () => {
    const sid = storeId || readPartnerSelectedStoreId(restaurantId);
    if (!isValidPartnerStoreId(sid)) return;
    if (runningRef.current) return;
    if (typeof window !== 'undefined' && sessionStorage.getItem(syncSessionKey(sid))) return;

    runningRef.current = true;
    try {
      const res = await fetch(
        `/api/merchant/sync-acceptance-timeout?store_id=${encodeURIComponent(sid)}`,
        { method: 'POST', credentials: 'include', cache: 'no-store' }
      );
      const data = (await res.json().catch(() => ({}))) as { cancelled?: number };
      if (!res.ok) return;

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(syncSessionKey(sid), String(Date.now()));
      }

      const cancelled = Number(data.cancelled ?? 0);
      if (cancelled > 0) {
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
  }, [restaurantId, storeId]);

  useEffect(() => {
    if (!storeReady) return;
    void runSync();
  }, [storeReady, runSync]);

  useEffect(() => {
    const onStore = () => {
      const sid = readPartnerSelectedStoreId(restaurantId);
      if (!isValidPartnerStoreId(sid)) return;
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem(syncSessionKey(sid));
      }
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
