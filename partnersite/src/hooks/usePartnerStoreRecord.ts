'use client';

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { fetchPartnerStoreRecord } from '@/lib/partner-store-record-fetch';
import { isValidPartnerStoreId } from '@/lib/partner-store-id-shared';
import { merchantKeys } from '@/lib/query-keys';

/** Cached store row — avoids refetching Supabase on every tab switch. */
export function usePartnerStoreRecord(storeId: string | null, options?: { enabled?: boolean }) {
  const enabled = (options?.enabled ?? true) && !!storeId && isValidPartnerStoreId(storeId);
  return useQuery({
    queryKey: merchantKeys.storeRecord(storeId ?? ''),
    queryFn: () => fetchPartnerStoreRecord(storeId!),
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
    retry: false,
  });
}
