import { useCallback, useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { fetchRealtimeAuthToken } from "@/services/ordersApi";

const DEBOUNCE_MS = 400;

/**
 * Live catalog updates when admin approves/rejects menu items or images.
 * Mirrors partnersite / cxsite menu realtime (items + categories + images).
 */
export function useMerchantMenuRealtime(options: {
  storeId: number | null;
  enabled: boolean;
  authToken: string | null;
  onMenuStale: () => void;
}) {
  const { storeId, enabled, authToken, onMenuStale } = options;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onStaleRef = useRef(onMenuStale);
  onStaleRef.current = onMenuStale;

  const scheduleRefresh = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      onStaleRef.current();
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (!enabled || storeId == null || storeId <= 0) return undefined;

    const supabase = getSupabaseAuth();
    if (!supabase) return undefined;

    const filter = `store_id=eq.${storeId}`;
    const topic = `merchant_menu:${storeId}`;
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const subscribe = () => {
      if (cancelled || channel) return;
      channel = supabase
        .channel(topic)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "merchant_menu_items", filter },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "merchant_menu_categories", filter },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "merchant_menu_item_images" },
          scheduleRefresh
        )
        .subscribe();
    };

    void (async () => {
      if (authToken) {
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
          /* subscribe anyway */
        }
      }
      if (!cancelled) subscribe();
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (refreshTimer) clearInterval(refreshTimer);
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [enabled, storeId, authToken, scheduleRefresh]);
}
