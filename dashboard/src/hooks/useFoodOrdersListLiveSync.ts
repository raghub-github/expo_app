"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { hydrateBrowserSupabaseFromCookies } from "@/lib/auth/hydrate-browser-supabase";

const DEBOUNCE_MS = 250;
/** Poll while Realtime is not live (RLS / publication / cold WS). */
const FALLBACK_POLL_MS = 2_000;
/** Light backup poll even when Realtime is SUBSCRIBED. */
const LIVE_BACKUP_POLL_MS = 6_000;
const SUBSCRIBE_PROBE_MS = 8_000;

/**
 * Keeps Food Orders stage tabs (PAYMENT DONE → ACCEPTED → …) in sync when an
 * order’s status changes — without a manual Refresh / page reload.
 */
export function useFoodOrdersListLiveSync(
  enabled: boolean,
  onRefresh: () => void | Promise<void>
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let debounceTimer: number | null = null;
    let pollTimer: number | null = null;
    let probeTimer: number | null = null;
    let subscribed = false;

    const runRefresh = () => {
      void Promise.resolve(onRefreshRef.current()).catch(() => {});
    };

    const scheduleRefresh = () => {
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        runRefresh();
      }, DEBOUNCE_MS);
    };

    const clearPoll = () => {
      if (pollTimer != null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPoll = (ms: number) => {
      clearPoll();
      pollTimer = window.setInterval(() => {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
        runRefresh();
      }, ms);
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") runRefresh();
    };
    const onFocus = () => runRefresh();

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    startPoll(FALLBACK_POLL_MS);

    probeTimer = window.setTimeout(() => {
      if (!subscribed) startPoll(FALLBACK_POLL_MS);
    }, SUBSCRIBE_PROBE_MS);

    void (async () => {
      await hydrateBrowserSupabaseFromCookies();
      if (cancelled) return;

      const ch = supabase.channel("food_orders_dashboard_list_live");
      if (cancelled) {
        void supabase.removeChannel(ch);
        return;
      }
      channel = ch;

      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders_core", filter: "order_type=eq.food" },
        scheduleRefresh
      )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "orders_food" },
          scheduleRefresh
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            subscribed = true;
            startPoll(LIVE_BACKUP_POLL_MS);
          } else if (
            status === "CHANNEL_ERROR" ||
            status === "TIMED_OUT" ||
            status === "CLOSED"
          ) {
            subscribed = false;
            startPoll(FALLBACK_POLL_MS);
          }
        });
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      if (debounceTimer != null) window.clearTimeout(debounceTimer);
      if (probeTimer != null) window.clearTimeout(probeTimer);
      clearPoll();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled]);
}
