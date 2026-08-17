import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { QueryClient } from "@tanstack/react-query";
import { getSupabaseAuth } from "@/src/lib/supabaseClient";
import { applySupabaseRealtimeAuth } from "@/src/lib/supabaseRealtimeAuth";
import {
  RIDER_BANK_STATUS_EVENT,
  bankStatusFromUnknown,
  emitRiderBankStatus,
  riderBankStatusChannel,
} from "@/src/lib/riderBankStatusBus";
import { EARNINGS_QUERY_KEY } from "@/src/hooks/useEarnings";
import {
  RIDER_BANK_CURRENT_QUERY_KEY,
  RIDER_BANK_LIST_QUERY_KEY,
} from "@/src/hooks/useRiderBankAccount";

/** Soft-refresh bank + earnings UI after approve/reject (broadcast or push). */
export function invalidateRiderBankStatusQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: RIDER_BANK_CURRENT_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: RIDER_BANK_LIST_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: ["rider", "payment-methods", "bank"] });
  void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
  void queryClient.invalidateQueries({ queryKey: [...EARNINGS_QUERY_KEY] });
}

/**
 * Instant bank approve/reject via Supabase broadcast while earnings is open.
 * No polling — push + broadcast only.
 */
export function useRiderBankStatusLive(options: {
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
    if (!supabase) return undefined;

    applySupabaseRealtimeAuth(supabase, accessToken);

    channel = supabase
      .channel(riderBankStatusChannel(riderId))
      .on("broadcast", { event: RIDER_BANK_STATUS_EVENT }, (msg) => {
        if (cancelled) return;
        const parsed = bankStatusFromUnknown(msg?.payload);
        if (!parsed || parsed.riderId !== riderId) return;
        emitRiderBankStatus(parsed);
        invalidateRiderBankStatusQueries(queryClient);
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
