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
 * No-ops when the Supabase URL / anon key are not configured, and while logged out
 * (so login never crashes if a stale channel is still subscribed).
 */

import { useEffect, useRef } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseAuth } from "@/src/lib/supabaseClient";
import { emitPreventServicesSignal } from "@/src/lib/preventServicesSignalBus";
import { useSessionStore } from "@/src/stores/sessionStore";

/** Query key prefixes whose answers depend on an active blocking rule. */
const AFFECTED_QUERY_KEYS = [
  ["rider", "geo", "services"],
  ["rider", "duty", "status"],
  ["rider", "orders", "available"],
] as const;

const CHANNEL_PREFIX = "prevent-services-signal";

function channelNameOf(topic: string): string {
  return topic.startsWith("realtime:") ? topic.slice("realtime:".length) : topic;
}

async function dropStaleChannels(supabase: SupabaseClient): Promise<void> {
  const stale = supabase.getChannels().filter((ch) => {
    const name = channelNameOf(ch.topic);
    return name === CHANNEL_PREFIX || name.startsWith(`${CHANNEL_PREFIX}:`);
  });
  if (stale.length === 0) return;
  await Promise.all(stale.map((ch) => supabase.removeChannel(ch)));
}

export function PreventServicesRealtime() {
  const queryClient = useQueryClient();
  const hasSession = useSessionStore((s) => Boolean(s.session?.accessToken));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasSession) return;

    const supabase = getSupabaseAuth();
    if (!supabase) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

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

    const setup = async () => {
      try {
        await dropStaleChannels(supabase);
        if (cancelled) return;
        // Unique topic so React remount cannot reuse a joined channel
        // (supabase-js throws if postgres_changes is added after subscribe()).
        const topic = `${CHANNEL_PREFIX}:${Date.now().toString(36)}`;
        channel = supabase
          .channel(topic)
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
      } catch (error) {
        channel = null;
        if (__DEV__) {
          console.warn("[PreventServicesRealtime] subscribe skipped", error);
        }
      }
    };

    void setup();

    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (channel) {
        try {
          void supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [queryClient, hasSession]);

  return null;
}
