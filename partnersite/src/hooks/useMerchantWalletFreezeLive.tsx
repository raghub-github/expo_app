'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { merchantKeys } from '@/lib/query-keys';
import {
  MERCHANT_WALLET_FREEZE_EVENT,
  merchantWalletFreezeChannel,
} from '@/lib/wallet-types';
import {
  clearDashboardWalletCache,
  readDashboardWalletCache,
  writeDashboardWalletCache,
} from '@/lib/partner-dashboard-cache';
import { usePartnerSelectedStore } from '@/lib/partner-selected-store';
import { setPartnerWalletFreezeOverlay } from '@/lib/merchant-wallet-freeze-overlay';
import type { WalletSummary } from '@/hooks/useMerchantApi';

const POLL_MS = 1500;

function freezeFromUnknown(raw: unknown): { isFrozen: boolean; freezeReason: string | null } | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const status = String(row.status ?? '').toUpperCase();
  if (row.action === 'unfreeze' || row.isFrozen === false || row.is_frozen === false) {
    return { isFrozen: false, freezeReason: null };
  }
  if (row.action === 'freeze' || row.isFrozen === true || row.is_frozen === true || status === 'FROZEN') {
    const reasonRaw = row.freezeReason ?? row.frozen_reason ?? row.reason ?? null;
    return {
      isFrozen: true,
      freezeReason: typeof reasonRaw === 'string' && reasonRaw.trim() ? reasonRaw.trim() : null,
    };
  }
  if (status && status !== 'FROZEN') {
    return { isFrozen: false, freezeReason: null };
  }
  return null;
}

function patchWalletQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  publicStoreId: string,
  isFrozen: boolean,
  freezeReason: string | null,
) {
    const patch = (old: WalletSummary | undefined): WalletSummary | undefined => {
    if (!old) return old;
    return {
      ...old,
      isFrozen,
      status: isFrozen ? 'FROZEN' : 'ACTIVE',
      freezeReason: isFrozen ? freezeReason : null,
      withdrawal_allowed: !isFrozen,
    };
  };
  for (const lite of ['lite', 'full'] as const) {
    const key = [...merchantKeys.wallet(publicStoreId), lite];
    queryClient.setQueryData<WalletSummary>(key, patch);
  }
  void queryClient.invalidateQueries({ queryKey: merchantKeys.wallet(publicStoreId) });
  const cached = readDashboardWalletCache(publicStoreId);
  if (cached) {
    writeDashboardWalletCache(publicStoreId, patch(cached) as WalletSummary);
  } else {
    clearDashboardWalletCache(publicStoreId);
  }
}

/**
 * Instant freeze/unfreeze for Withdraw on Payments (and any cached wallet card).
 * Broadcast is the primary path; postgres_changes + 1.5s poll are backups.
 */
export function MerchantWalletFreezeLive() {
  const queryClient = useQueryClient();
  const { storeId, storeInternalId } = usePartnerSelectedStore();
  const lastKey = useRef<string>('');

  useEffect(() => {
    if (!storeId) return undefined;

    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let channel: RealtimeChannel | null = null;
    const supabase = createClient();

    const apply = (isFrozen: boolean, freezeReason: string | null) => {
      if (cancelled) return;
      const key = `${storeId}:${isFrozen ? 1 : 0}:${freezeReason ?? ''}`;
      if (lastKey.current === key) return;
      lastKey.current = key;
      setPartnerWalletFreezeOverlay(storeId, isFrozen, freezeReason);
      patchWalletQueries(queryClient, storeId, isFrozen, freezeReason);
    };

    const pollOnce = async () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(
          `/api/merchant/wallet/freeze-status?storeId=${encodeURIComponent(storeId)}`,
          { credentials: 'include' },
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          isFrozen?: boolean;
          freezeReason?: string | null;
          status?: string;
        };
        const isFrozen = data.isFrozen === true || String(data.status ?? '').toUpperCase() === 'FROZEN';
        apply(isFrozen, isFrozen ? data.freezeReason ?? null : null);
      } catch {
        /* ignore */
      }
    };

    const startPoll = () => {
      if (pollTimer) return;
      void pollOnce();
      pollTimer = setInterval(() => {
        void pollOnce();
      }, POLL_MS);
    };
    const stopPoll = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') startPoll();
      else stopPoll();
    };
    document.addEventListener('visibilitychange', onVis);
    startPoll();

    if (storeInternalId) {
      channel = supabase
        .channel(merchantWalletFreezeChannel(storeInternalId))
        .on('broadcast', { event: MERCHANT_WALLET_FREEZE_EVENT }, (msg) => {
          const parsed = freezeFromUnknown(msg?.payload);
          if (parsed) apply(parsed.isFrozen, parsed.freezeReason);
        })
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'merchant_wallet',
            filter: `merchant_store_id=eq.${storeInternalId}`,
          },
          (payload) => {
            const parsed = freezeFromUnknown(payload.new ?? payload.old);
            if (parsed) apply(parsed.isFrozen, parsed.freezeReason);
            else void pollOnce();
          },
        )
        .subscribe();
    }

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      stopPoll();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [queryClient, storeId, storeInternalId]);

  return null;
}
