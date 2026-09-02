import { useCallback, useEffect, useRef } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { fetchRealtimeAuthToken } from "@/services/ordersApi";

const DEBOUNCE_MS = 250;

function channelNameOf(topic: string): string {
  return topic.startsWith("realtime:") ? topic.slice("realtime:".length) : topic;
}

async function dropStoreOrderChannels(supabase: SupabaseClient, topicBase: string): Promise<void> {
  const stale = supabase.getChannels().filter((ch) => {
    const name = channelNameOf(ch.topic);
    return name === topicBase || name.startsWith(`${topicBase}:`);
  });
  if (stale.length === 0) return;
  await Promise.all(stale.map((ch) => supabase.removeChannel(ch)));
}

/**
 * Supabase postgres_changes on orders_core + orders_food — same pattern as partnersite food-orders page.
 * Supports one or many store IDs (multi-store "manage orders from").
 */
export function useMerchantOrdersRealtime(options: {
  storeIds: number[];
  enabled: boolean;
  /** Merchant session token — used to mint the Supabase realtime auth token (RLS). */
  authToken: string | null;
  onOrdersStale: () => void;
  onFoodRowChange?: (foodId: number, merchantStoreId: number | null) => void;
}) {
  const { storeIds, enabled, authToken, onOrdersStale, onFoodRowChange } = options;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onStaleRef = useRef(onOrdersStale);
  onStaleRef.current = onOrdersStale;
  const onFoodRowChangeRef = useRef(onFoodRowChange);
  onFoodRowChangeRef.current = onFoodRowChange;

  const scheduleRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      onStaleRef.current();
    }, DEBOUNCE_MS);
  }, []);

  const handleFoodRow = useCallback(
    (payload: {
      new?: { id?: number | string; merchant_store_id?: number | string | null } | null;
    }) => {
      const rawId = payload?.new?.id;
      const foodId = typeof rawId === "string" ? parseInt(rawId, 10) : Number(rawId);
      const rawStore = payload?.new?.merchant_store_id;
      const merchantStoreId =
        rawStore == null || rawStore === ""
          ? null
          : typeof rawStore === "string"
            ? parseInt(rawStore, 10)
            : Number(rawStore);
      if (Number.isFinite(foodId) && foodId > 0) {
        onFoodRowChangeRef.current?.(
          foodId,
          Number.isFinite(merchantStoreId as number) ? (merchantStoreId as number) : null
        );
        // Single-row patch is enough — skip a full multi-store list refetch.
        if (onFoodRowChangeRef.current) return;
      }
      scheduleRefetch();
    },
    [scheduleRefetch]
  );

  const idsKey = storeIds
    .filter((id) => Number.isFinite(id) && id > 0)
    .sort((a, b) => a - b)
    .join(",");

  useEffect(() => {
    const ids = idsKey
      .split(",")
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (!enabled || ids.length === 0) return undefined;

    const supabase = getSupabaseAuth();
    if (!supabase) return undefined;

    const filter =
      ids.length === 1
        ? `merchant_store_id=eq.${ids[0]}`
        : `merchant_store_id=in.(${ids.join(",")})`;
    const topicBase = `merchant_store_orders:${ids.join("_")}`;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const subscribe = async () => {
      if (cancelled || channel) return;
      try {
        await dropStoreOrderChannels(supabase, topicBase);
        if (cancelled) return;
        const topic = `${topicBase}:${Date.now().toString(36)}`;
        channel = supabase
          .channel(topic)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "orders_core", filter },
            scheduleRefetch
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "orders_food", filter },
            handleFoodRow
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
          /* subscribe anyway; RLS may still deliver for some policies */
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
  }, [enabled, idsKey, authToken, scheduleRefetch, handleFoodRow]);
}
