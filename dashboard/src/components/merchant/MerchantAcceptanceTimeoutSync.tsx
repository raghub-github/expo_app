'use client';

import { Suspense, useCallback, useEffect, useRef } from 'react';
import { useStoreContext } from '@/app/dashboard/merchants/stores/[id]/StoreContext';

const SYNC_SESSION_PREFIX = 'merchant-acceptance-sync:';

function syncSessionKey(storeId: string): string {
  return `${SYNC_SESSION_PREFIX}${storeId.trim()}`;
}

function MerchantAcceptanceTimeoutSyncInner() {
  const { storeId } = useStoreContext();
  const runningRef = useRef(false);

  const runSync = useCallback(async () => {
    if (!storeId) return;
    if (runningRef.current) return;
    if (typeof window !== 'undefined' && sessionStorage.getItem(syncSessionKey(storeId))) return;

    runningRef.current = true;
    try {
      const res = await fetch(`/api/merchant/stores/${storeId}/sync-acceptance-timeout`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await res.json().catch(() => ({}))) as { cancelled?: number };
      if (!res.ok) return;

      if (typeof window !== 'undefined') {
        sessionStorage.setItem(syncSessionKey(storeId), String(Date.now()));
      }

      const cancelled = Number(data.cancelled ?? 0);
      if (cancelled > 0) {
        window.dispatchEvent(new CustomEvent('merchant-pending-orders-refresh'));
        window.dispatchEvent(new CustomEvent('merchant-incoming-order-scan'));
        window.dispatchEvent(new CustomEvent('merchant-food-orders-refresh'));
      }
    } catch {
      /* ignore */
    } finally {
      runningRef.current = false;
    }
  }, [storeId]);

  useEffect(() => {
    void runSync();
  }, [runSync]);

  return null;
}

export function MerchantAcceptanceTimeoutSync() {
  return (
    <Suspense fallback={null}>
      <MerchantAcceptanceTimeoutSyncInner />
    </Suspense>
  );
}
