'use client';

import { useEffect } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { usePartnerSelectedStore } from '@/lib/partner-selected-store';
import { emitPartnerStoreOperationsRefresh } from '@/lib/partnerStoreOperationsRefresh';
import { merchantKeys } from '@/lib/query-keys';

const MERCHANT_STORE_DELIST_EVENT = 'store_delist';

function merchantStoreDelistChannel(storeId: number | string): string {
  return `merchant_store_delist:${storeId}`;
}

function isDelistedPayload(raw: unknown): boolean | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  if (row.action === 'relist' || row.isDelisted === false) return false;
  if (row.action === 'delist' || row.isDelisted === true) return true;
  if (row.delisted_at != null && String(row.delisted_at).trim() !== '') return true;
  const approval = String(row.approval_status ?? '').toUpperCase();
  if (approval === 'DELISTED') return true;
  if (approval && approval !== 'DELISTED') return false;
  return null;
}

/** Instant close of Partner Site store toggle when admin delists. */
export function MerchantStoreDelistLive() {
  const { storeId, storeInternalId } = usePartnerSelectedStore();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!storeId || !storeInternalId) return undefined;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let lastKnown: boolean | null = null;
    const supabase = createClient();

    const apply = (delisted: boolean) => {
      if (cancelled) return;
      if (lastKnown === delisted) return;
      lastKnown = delisted;
      void queryClient.invalidateQueries({ queryKey: merchantKeys.storeRecord(storeId) });
      void queryClient.invalidateQueries({ queryKey: merchantKeys.storeOperations(storeId) });
      if (delisted) {
        emitPartnerStoreOperationsRefresh(storeId, { forceClosed: true, isDelisted: true });
      } else {
        emitPartnerStoreOperationsRefresh(storeId, { isDelisted: false });
      }
    };

    channel = supabase
      .channel(merchantStoreDelistChannel(storeInternalId))
      .on('broadcast', { event: MERCHANT_STORE_DELIST_EVENT }, (msg) => {
        const parsed = isDelistedPayload(msg?.payload);
        if (parsed != null) apply(parsed);
      })
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'merchant_stores',
          filter: `id=eq.${storeInternalId}`,
        },
        (payload) => {
          const parsed = isDelistedPayload(payload.new);
          if (parsed != null) apply(parsed);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [storeId, storeInternalId, queryClient]);

  return null;
}
