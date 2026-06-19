import { useCallback, useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";

const DEBOUNCE_MS = 250;

/**
 * Supabase postgres_changes on orders_core + orders_food — same pattern as partnersite food-orders page.
 * Debounced refetch keeps rider/status updates smooth without hammering the API.
 */
export function useMerchantOrdersRealtime(options: {
  storeId: number | null;
  enabled: boolean;
  onOrdersStale: () => void;
}) {
  const { storeId, enabled, onOrdersStale } = options;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onStaleRef = useRef(onOrdersStale);
  onStaleRef.current = onOrdersStale;

  const scheduleRefetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      onStaleRef.current();
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (!enabled || storeId == null || !Number.isFinite(storeId)) return undefined;

    const supabase = getSupabaseAuth();
    if (!supabase) return undefined;

    const topic = `merchant_store_orders:${storeId}`;
    const filter = `merchant_store_id=eq.${storeId}`;

    const channel: RealtimeChannel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders_core", filter },
        scheduleRefetch
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders_food", filter },
        scheduleRefetch
      )
      .subscribe();

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [enabled, scheduleRefetch, storeId]);
}
