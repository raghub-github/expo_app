'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMerchantSession } from '@/context/MerchantSessionContext';
import { merchantKeys } from '@/lib/query-keys';
import { readPartnerSelectedStoreId } from '@/lib/partner-selected-store';

/**
 * After background session re-validation, refresh only critical store-scoped
 * queries — not every merchantKeys.all entry (that caused full-page reload feel).
 */
export function PartnerMerchantQueryFocusSync() {
  const session = useMerchantSession();
  const queryClient = useQueryClient();
  const wasRefreshingRef = useRef(false);

  useEffect(() => {
    const wasRefreshing = wasRefreshingRef.current;
    const isRefreshing = session?.isRefreshing === true;
    wasRefreshingRef.current = isRefreshing;

    if (wasRefreshing && !isRefreshing && session?.isAuthenticated) {
      const storeId = readPartnerSelectedStoreId();
      if (storeId) {
        void queryClient.invalidateQueries({
          queryKey: merchantKeys.storeOperations(storeId),
        });
        void queryClient.invalidateQueries({
          queryKey: merchantKeys.wallet(storeId),
        });
      }
    }
  }, [session?.isRefreshing, session?.isAuthenticated, queryClient]);

  return null;
}
