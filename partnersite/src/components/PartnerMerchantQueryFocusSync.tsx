'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useMerchantSession } from '@/context/MerchantSessionContext';
import { merchantKeys } from '@/lib/query-keys';

/** Refetch store-scoped merchant queries after background session re-validation completes. */
export function PartnerMerchantQueryFocusSync() {
  const session = useMerchantSession();
  const queryClient = useQueryClient();
  const wasRefreshingRef = useRef(false);

  useEffect(() => {
    const wasRefreshing = wasRefreshingRef.current;
    const isRefreshing = session?.isRefreshing === true;
    wasRefreshingRef.current = isRefreshing;

    if (wasRefreshing && !isRefreshing && session?.isAuthenticated) {
      void queryClient.invalidateQueries({ queryKey: merchantKeys.all });
    }
  }, [session?.isRefreshing, session?.isAuthenticated, queryClient]);

  return null;
}
