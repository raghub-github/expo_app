/**
 * Instant Prevent Services propagation for the merchant app (mounted app-wide).
 *
 * When a Super Admin blocks a service for a radius that overlaps this store's
 * delivery circle, new orders whose *drop* falls inside that radius are withheld
 * at placement — the store is never turned offline. This listener refreshes the
 * order board and store status so the merchant sees the current state within ~1s.
 *
 * UX (modal + banner) lives in ServiceRestrictedNotice.
 */

import { useEffect, useRef } from "react";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { useOrdersContext } from "@/context/OrdersContext";
import { useStoreStatus } from "@/context/StoreStatusContext";
import { emitPreventServicesSignal } from "@/lib/preventServicesSignalBus";

export default function PreventServicesRealtime() {
  const { refetch } = useOrdersContext();
  const { refresh } = useStoreStatus();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs keep the subscription alive across context re-renders; resubscribing
  // on every render would drop events.
  const refetchRef = useRef(refetch);
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refetchRef.current = refetch;
    refreshRef.current = refresh;
  }, [refetch, refresh]);

  useEffect(() => {
    const supabase = getSupabaseAuth();
    if (!supabase) return;

    // One admin save touches rules + services + locations, so several row
    // triggers fire back to back. Coalesce them into a single refresh.
    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void refetchRef.current().catch(() => {});
        void refreshRef.current().catch(() => {});
        emitPreventServicesSignal();
      }, 150);
    };

    const channel = supabase
      .channel("prevent-services-signal")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prevent_service_signals",
        },
        () => scheduleRefresh()
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, []);

  return null;
}
