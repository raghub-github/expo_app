/**
 * Subscribe to Supabase realtime for merchant_stores UPDATE.
 * Updates storeStatusStore so list/card/detail/menu stay in sync without refresh.
 * No-ops when EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set.
 */

import { useEffect, useRef } from "react";
import { getConfig } from "@/config/env";
import { useStoreStatusStore, computeLiveStatusFromRow } from "@/store/storeStatusStore";

type RealtimePayloadRow = {
  store_id?: string | null;
  live_status?: string | null;
  is_active?: boolean | null;
  is_available?: boolean | null;
  is_accepting_orders?: boolean | null;
  operational_status?: string | null;
};

export function useStoreStatusRealtime() {
  const setStatus = useStoreStatusStore((s) => s.setStatus);
  const channelRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    const { supabaseUrl, supabaseAnonKey } = getConfig();
    if (!supabaseUrl || !supabaseAnonKey) return;

    let client: import("@supabase/supabase-js").SupabaseClient;
    try {
      const { createClient } = require("@supabase/supabase-js");
      client = createClient(supabaseUrl, supabaseAnonKey);
    } catch {
      return;
    }

    const channel = client
      .channel("store-status")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "merchant_stores",
        },
        (payload: { new: RealtimePayloadRow }) => {
          const row = payload.new;
          const storeId = row?.store_id;
          if (typeof storeId !== "string" || !storeId) return;
          const status: "OPEN" | "CLOSED" =
            row.live_status === "OPEN" || row.live_status === "CLOSED"
              ? row.live_status
              : computeLiveStatusFromRow({
                  is_active: row.is_active,
                  is_available: row.is_available,
                  is_accepting_orders: row.is_accepting_orders,
                  operational_status: row.operational_status,
                });
          setStatus(storeId, status);
        }
      )
      .subscribe();

    channelRef.current = {
      unsubscribe: () => {
        try {
          client.removeChannel(channel);
        } catch {}
      },
    };

    return () => {
      channelRef.current?.unsubscribe();
      channelRef.current = null;
    };
  }, [setStatus]);
}
