/**
 * Instant rider-online-check toggle (mounted app-wide).
 *
 * Super Admin → Geo & coverage → per-state "Rider online check" writes
 * `states.require_rider_online_check`. A column trigger bumps the single-row
 * `rider_online_check_signals` table. Checkout closes the "No rider available"
 * modal immediately when the gate turns OFF and re-checks when it turns ON.
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getConfig } from "@/config/env";

const AFFECTED_QUERY_KEYS = [["geo", "services"], ["geo", "dispatch-serviceability"]] as const;

export type RiderOnlineCheckSignal = {
  require_rider_online_check?: boolean | null;
  state_id?: string | null;
};

const signalListeners = new Set<(payload: RiderOnlineCheckSignal) => void>();

/** Subscribe to Super Admin rider-online-check toggles (no extra Realtime channel). */
export function subscribeRiderOnlineCheckSignal(
  fn: (payload: RiderOnlineCheckSignal) => void
): () => void {
  signalListeners.add(fn);
  return () => {
    signalListeners.delete(fn);
  };
}

export function useRiderOnlineCheckRealtime() {
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

    const scheduleInvalidate = (payload: RiderOnlineCheckSignal) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        for (const queryKey of AFFECTED_QUERY_KEYS) {
          void queryClient.invalidateQueries({
            queryKey: [...queryKey],
            refetchType: "all",
          });
        }
        for (const fn of signalListeners) fn(payload);
      }, 40);
    };

    const channel = client
      .channel("rider-online-check-signal")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rider_online_check_signals",
        },
        (event: { new?: Record<string, unknown> | null }) => {
          const rec = event.new ?? {};
          scheduleInvalidate({
            require_rider_online_check:
              typeof rec.require_rider_online_check === "boolean"
                ? rec.require_rider_online_check
                : null,
            state_id: typeof rec.state_id === "string" ? rec.state_id : null,
          });
        }
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
