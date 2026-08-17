import { useCallback, useEffect, useRef } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { fetchRealtimeAuthToken } from "@/services/ordersApi";

const DEBOUNCE_MS = 400;

function channelNameOf(topic: string): string {
  return topic.startsWith("realtime:") ? topic.slice("realtime:".length) : topic;
}

async function dropStoreMenuChannels(supabase: SupabaseClient, storeId: number): Promise<void> {
  const prefix = `merchant_menu:${storeId}`;
  const stale = supabase.getChannels().filter((ch) => {
    const name = channelNameOf(ch.topic);
    return name === prefix || name.startsWith(`${prefix}:`);
  });
  if (stale.length === 0) return;
  await Promise.all(stale.map((ch) => supabase.removeChannel(ch)));
}

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
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const subscribe = async () => {
      if (cancelled || channel) return;
      try {
        await dropStoreMenuChannels(supabase, storeId);
        if (cancelled) return;
        // Unique topic so React remount / auth refresh cannot reuse a joined channel
        // (supabase-js throws if postgres_changes is added after subscribe()).
        const topic = `merchant_menu:${storeId}:${Date.now().toString(36)}`;
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
      } catch {
        channel = null;
      }
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
      if (!cancelled) await subscribe();
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
