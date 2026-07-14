import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { getConfig } from "@/config/env";
import { syncStoreOffersInBackground } from "@/lib/prefetchStoreOffers";

/**
 * Supabase realtime for merchant_offers — debounced silent offer refresh.
 * Mirrors useMerchantMenuRealtime: only runs while restaurant detail is mounted.
 * Does not reload menu / scroll / categories — only store-offers queries.
 */
export function useStoreOffersRealtime(
  merchantId: string | undefined,
  queryClient: QueryClient
) {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!merchantId) return;

    const { supabaseUrl, supabaseAnonKey } = getConfig();
    if (!supabaseUrl || !supabaseAnonKey) return;

    let client: import("@supabase/supabase-js").SupabaseClient;
    try {
      const { createClient } = require("@supabase/supabase-js");
      client = createClient(supabaseUrl, supabaseAnonKey);
    } catch {
      return;
    }

    const scheduleSync = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void syncStoreOffersInBackground(queryClient, merchantId);
      }, 400);
    };

    const channel = client
      .channel(`store-offers-${merchantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "merchant_offers" },
        () => scheduleSync()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "merchant_offer_applicability" },
        () => scheduleSync()
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        client.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [merchantId, queryClient]);
}
