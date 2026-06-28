import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { getConfig } from "@/config/env";
import { syncMerchantMenuInBackground } from "@/lib/merchantMenuSync";

/**
 * Supabase realtime for merchant_menu_items — debounced delta sync.
 * Only runs while the store screen is mounted.
 */
export function useMerchantMenuRealtime(
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
        void syncMerchantMenuInBackground(queryClient, merchantId);
      }, 400);
    };

    const channel = client
      .channel(`merchant-menu-${merchantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "merchant_menu_items" },
        () => scheduleSync()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "merchant_menu_categories" },
        () => scheduleSync()
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        client.removeChannel(channel);
      } catch {}
    };
  }, [merchantId, queryClient]);
}
