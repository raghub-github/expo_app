import { useEffect } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { fetchRealtimeAuthToken } from "@/services/ordersApi";
import {
  MERCHANT_STORE_DELIST_EVENT,
  delistStateFromUnknown,
  emitMerchantStoreDelist,
  merchantStoreDelistChannel,
} from "@/lib/merchantStoreDelistBus";

/**
 * Instant delist/relist overlay. Broadcast is primary; postgres_changes is backup.
 * Store status GET poll remains the slow fallback.
 */
export function useMerchantStoreDelistLive(options: {
  storeId: number | null;
  authToken: string | null;
  enabled: boolean;
}): void {
  const { storeId, authToken, enabled } = options;

  useEffect(() => {
    if (!enabled || storeId == null || storeId < 1 || !authToken) return undefined;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;
    const supabase = getSupabaseAuth();

    const apply = (isDelisted: boolean) => {
      if (cancelled) return;
      emitMerchantStoreDelist({ storeId, isDelisted });
    };

    const subscribeRealtime = () => {
      if (cancelled || !supabase || channel) return;
      channel = supabase
        .channel(merchantStoreDelistChannel(storeId))
        .on("broadcast", { event: MERCHANT_STORE_DELIST_EVENT }, (msg) => {
          const parsed = delistStateFromUnknown(msg?.payload);
          if (parsed != null) apply(parsed);
        })
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "merchant_stores",
            filter: `id=eq.${storeId}`,
          },
          (payload) => {
            const parsed = delistStateFromUnknown(payload.new ?? payload.old);
            if (parsed != null) apply(parsed);
          },
        )
        .subscribe();
    };

    void (async () => {
      if (supabase && authToken) {
        try {
          const rt = await fetchRealtimeAuthToken(authToken);
          if (cancelled) return;
          supabase.realtime.setAuth(rt.token);
          const refreshMs = Math.max(60_000, (rt.expiresIn - 300) * 1000);
          refreshTimer = setInterval(() => {
            void (async () => {
              try {
                const next = await fetchRealtimeAuthToken(authToken);
                if (!cancelled) supabase.realtime.setAuth(next.token);
              } catch {
                /* keep last token */
              }
            })();
          }, refreshMs);
        } catch {
          /* subscribe anyway — broadcast does not need RLS */
        }
      }
      if (!cancelled) subscribeRealtime();
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      if (channel && supabase) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [enabled, storeId, authToken]);
}
