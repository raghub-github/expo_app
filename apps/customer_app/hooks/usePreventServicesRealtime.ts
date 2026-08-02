/**
 * Instant Prevent Services propagation (mounted once, app-wide).
 *
 * Super Admin → Geo & coverage → Prevent Services writes to
 * prevent_service_rules / _services / _locations. A statement trigger bumps the
 * single-row `prevent_service_signals` counter (drizzle 0477), which is the only
 * Prevent Services table published to Supabase Realtime — so the app learns
 * about a create / edit / pause / resume / delete / expiry within ~1s and
 * refetches service availability itself. No pull-to-refresh, no force close.
 *
 * Everything that renders service availability is invalidated together so the
 * home tiles, store lists and booking screens flip in the same pass:
 *   - ["geo", "services", …]  → food / parcel / ride toggles
 *   - ["merchants"] / ["search"] / ["food-home"] → store listing
 *   - ["rides"] → ride availability / quotes
 *
 * No-ops when EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are
 * unset; the polling safety net in useGeoServiceAvailability still applies.
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getConfig } from "@/config/env";

/** Query key prefixes refetched when a blocking rule changes. */
const AFFECTED_QUERY_KEYS = [
  ["geo", "services"],
  ["prevent", "check"],
  ["merchants"],
  ["search"],
  ["food-home"],
  ["rides"],
] as const;

export function usePreventServicesRealtime() {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    // One admin save touches several tables — coalesce, but keep it snappy.
    const scheduleInvalidate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        for (const queryKey of AFFECTED_QUERY_KEYS) {
          void queryClient.invalidateQueries({
            queryKey: [...queryKey],
            refetchType: "all",
          });
        }
      }, 50);
    };

    const channel = client
      .channel("prevent-services-signal")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "prevent_service_signals",
        },
        () => scheduleInvalidate()
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        client.removeChannel(channel);
      } catch {}
    };
  }, [queryClient]);
}
