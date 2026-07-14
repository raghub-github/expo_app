import { useCallback, useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { fetchRealtimeAuthToken } from "@/services/ordersApi";

const DEBOUNCE_MS = 250;

/**
 * Supabase postgres_changes on orders_core + orders_food — same pattern as partnersite food-orders page.
 *
 * Two-tier reaction, matching the Partner Site:
 *   - `onFoodRowChange(foodId)` fires *immediately* (no debounce) for every
 *     orders_food INSERT/UPDATE so the incoming-order modal can open/close from
 *     the realtime event via a single targeted fetch — no full list refetch in
 *     the critical path.
 *   - `onOrdersStale()` is debounced and drives the full-list refetch used only
 *     for silent background reconciliation (rider/status enrichment).
 */
export function useMerchantOrdersRealtime(options: {
  storeId: number | null;
  enabled: boolean;
  /** Merchant session token — used to mint the Supabase realtime auth token (RLS). */
  authToken: string | null;
  onOrdersStale: () => void;
  onFoodRowChange?: (foodId: number) => void;
}) {
  const { storeId, enabled, authToken, onOrdersStale, onFoodRowChange } = options;
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
    (payload: { new?: { id?: number | string } | null }) => {
      const rawId = payload?.new?.id;
      const foodId = typeof rawId === "string" ? parseInt(rawId, 10) : Number(rawId);
      if (Number.isFinite(foodId) && foodId > 0) {
        onFoodRowChangeRef.current?.(foodId);
      }
      // Always keep the background reconcile scheduled too.
      scheduleRefetch();
    },
    [scheduleRefetch]
  );

  useEffect(() => {
    if (!enabled || storeId == null || !Number.isFinite(storeId)) return undefined;

    const supabase = getSupabaseAuth();
    if (!supabase) return undefined;

    const topic = `merchant_store_orders:${storeId}`;
    const filter = `merchant_store_id=eq.${storeId}`;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let refreshTimer: ReturnType<typeof setInterval> | null = null;

    const subscribe = () => {
      if (cancelled || channel) return;
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
    };

    void (async () => {
      // Authorize the Supabase client for realtime under RLS (orders_* have RLS
      // policies scoped to the merchant's store_ids). Without this the anon client
      // receives NO postgres_changes; polling is only a fallback, not the primary path.
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
                /* keep last token; refreshed next tick */
              }
            })();
          }, refreshMs);
        } catch {
          // Realtime auth failed — still subscribe (RLS may block, but polling covers it).
        }
      }
      subscribe();
    })();

    return () => {
      cancelled = true;
      if (refreshTimer) clearInterval(refreshTimer);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, scheduleRefetch, handleFoodRow, storeId, authToken]);
}
