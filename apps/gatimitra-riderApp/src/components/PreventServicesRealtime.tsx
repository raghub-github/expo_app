/**
 * Instant Prevent Services propagation for the rider app (mounted app-wide).
 *
 * Super Admin → Geo & coverage → Prevent Services can stop a service inside a
 * radius mid-shift. New requests are already withheld server-side, but the duty
 * filter and the available-orders board would keep showing the pre-block state
 * until their next poll. A statement-free row trigger bumps the single-row
 * `prevent_service_signals` table (drizzle 0477) on every rule change, and that
 * table is published to Supabase Realtime — so this refetches within ~1s
 * without the rider pulling to refresh or restarting the app.
 *
 * No-ops when the Supabase URL / anon key are not configured.
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseAuth } from "@/src/lib/supabaseClient";
import { emitPreventServicesSignal } from "@/src/lib/preventServicesSignalBus";

/** Query key prefixes whose answers depend on an active blocking rule. */
const AFFECTED_QUERY_KEYS = [
  ["rider", "geo", "services"],
  ["rider", "duty", "status"],
  ["rider", "orders", "available"],
] as const;

export function PreventServicesRealtime() {
  const queryClient = useQueryClient();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getSupabaseAuth();
    if (!supabase) return;

    // One admin save touches rules + services + locations, so several row
    // triggers fire back to back. Coalesce them into a single refetch.
    const scheduleInvalidate = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        for (const queryKey of AFFECTED_QUERY_KEYS) {
          void queryClient.invalidateQueries({
            queryKey: [...queryKey],
            refetchType: "all",
          });
        }
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
        () => scheduleInvalidate()
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        supabase.removeChannel(channel);
      } catch {}
    };
  }, [queryClient]);

  return null;
}
