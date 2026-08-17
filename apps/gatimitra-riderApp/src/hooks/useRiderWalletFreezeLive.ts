import { useEffect, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { getSupabaseAuth } from "@/src/lib/supabaseClient";
import { applySupabaseRealtimeAuth } from "@/src/lib/supabaseRealtimeAuth";
import {
  RIDER_WALLET_FREEZE_EVENT,
  emitRiderWalletFreeze,
  freezeStateFromUnknown,
  getRiderWalletFreezeSnapshot,
  riderWalletFreezeChannel,
  subscribeRiderWalletFreeze,
  type RiderWalletFreezeLiveState,
} from "@/src/lib/riderWalletFreezeBus";
import { EARNINGS_QUERY_KEY, type EarningsSummary } from "@/src/hooks/useEarnings";

function parseRiderNumericId(session: {
  riderId?: string;
  userId?: string;
} | null): number | null {
  if (!session) return null;
  const fromRider = Number(String(session.riderId ?? "").replace(/^usr_/, ""));
  if (Number.isInteger(fromRider) && fromRider > 0) return fromRider;
  const m = String(session.userId ?? "").match(/usr_(\d+)/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function patchEarningsFreeze(
  queryClient: QueryClient,
  isFrozen: boolean,
  freezeReason: string | null,
): void {
  queryClient.setQueryData<EarningsSummary>(EARNINGS_QUERY_KEY, (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      isFrozen,
      freezeReason: isFrozen ? freezeReason : null,
      canWithdraw: isFrozen ? false : prev.canWithdraw,
    };
  });
}

/** Apply freeze instantly (bus + React Query cache). No network. */
export function applyRiderWalletFreezeLive(
  queryClient: QueryClient,
  riderId: number,
  isFrozen: boolean,
  freezeReason: string | null,
): void {
  emitRiderWalletFreeze({ riderId, isFrozen, freezeReason });
  patchEarningsFreeze(queryClient, isFrozen, freezeReason);
}

export function useRiderWalletFreezeState(
  riderId: number | null | undefined,
): RiderWalletFreezeLiveState | null {
  const [state, setState] = useState<RiderWalletFreezeLiveState | null>(() =>
    getRiderWalletFreezeSnapshot(riderId),
  );

  useEffect(() => {
    setState(getRiderWalletFreezeSnapshot(riderId));
    return subscribeRiderWalletFreeze((next) => {
      if (riderId != null && next.riderId === riderId) setState(next);
    });
  }, [riderId]);

  return state;
}

/**
 * Instant freeze/unfreeze via Supabase broadcast (merchant parity).
 * No polling — push + broadcast only (I/O light).
 */
export function useRiderWalletFreezeLive(options: {
  riderId: number | null;
  accessToken: string | null;
  enabled: boolean;
  queryClient: QueryClient;
}): void {
  const { riderId, accessToken, enabled, queryClient } = options;

  useEffect(() => {
    if (!enabled || riderId == null || riderId < 1) return undefined;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const supabase = getSupabaseAuth();

    const apply = (isFrozen: boolean, freezeReason: string | null) => {
      if (cancelled) return;
      applyRiderWalletFreezeLive(queryClient, riderId, isFrozen, freezeReason);
    };

    if (!supabase) return undefined;

    applySupabaseRealtimeAuth(supabase, accessToken);

    channel = supabase
      .channel(riderWalletFreezeChannel(riderId))
      .on("broadcast", { event: RIDER_WALLET_FREEZE_EVENT }, (msg) => {
        const parsed = freezeStateFromUnknown(msg?.payload);
        if (parsed) apply(parsed.isFrozen, parsed.freezeReason);
      })
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [enabled, riderId, accessToken, queryClient]);
}

export { parseRiderNumericId };
