'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { merchantKeys } from '@/lib/query-keys';
import { readPartnerLastParentId } from '@/lib/partner-selected-store';

export type PartnerResolveSessionStore = {
  id: number;
  store_id: string;
  store_name: string;
  owner_full_name?: string | null;
  full_address?: string | null;
  approval_status?: string | null;
  banner_url?: string | null;
  is_active?: boolean | null;
};

export type PartnerResolveSessionData = {
  success: boolean;
  parentId?: number;
  parentMerchantId?: string | null;
  parentName?: string | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  parentLogo?: string | null;
  stores: PartnerResolveSessionStore[];
};

async function fetchPartnerResolveSession(
  parentId?: string | null
): Promise<PartnerResolveSessionData> {
  const q = parentId?.trim() ? `?parent_id=${encodeURIComponent(parentId.trim())}` : '';
  const res = await fetch(`/api/merchant-auth/resolve-session${q}`, { credentials: 'include' });
  const data = (await res.json().catch(() => ({}))) as PartnerResolveSessionData & { error?: string };
  if (!res.ok || !data.success) {
    throw new Error(data.error ?? 'Failed to resolve session');
  }
  return {
    ...data,
    stores: Array.isArray(data.stores) ? data.stores : [],
  };
}

/** Cached merchant stores list — shared by sidebar, top bar, and pages. */
export function usePartnerResolveSession(options?: {
  enabled?: boolean;
  parentId?: string | number | null;
}) {
  const [lastParentId, setLastParentId] = useState('');
  useEffect(() => {
    setLastParentId(readPartnerLastParentId());
  }, []);
  const preferredParentId =
    options?.parentId != null && String(options.parentId).trim()
      ? String(options.parentId).trim()
      : lastParentId;

  return useQuery({
    queryKey: merchantKeys.resolveSession(preferredParentId || null),
    queryFn: () => fetchPartnerResolveSession(preferredParentId || null),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
  });
}

export function useApprovedPartnerStores(options?: { enabled?: boolean }) {
  const query = usePartnerResolveSession(options);
  const approvedStores = useMemo(
    () =>
      (query.data?.stores ?? []).filter(
        (s) => String(s.approval_status || '').toUpperCase() === 'APPROVED'
      ),
    [query.data?.stores]
  );
  return { ...query, approvedStores };
}
