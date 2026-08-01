"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { hydrateBrowserSupabaseFromCookies } from "@/lib/auth/hydrate-browser-supabase";

/** Batch partner resubmit bursts into one refetch. */
const DEBOUNCE_MS = 180;
/** Poll while Realtime is not live (RLS / publication / cold WS). */
const FALLBACK_POLL_MS = 2_500;
/** Light backup poll even when Realtime is SUBSCRIBED. */
const LIVE_BACKUP_POLL_MS = 10_000;
/** Switch to fallback poll if subscribe never confirms. */
const SUBSCRIBE_PROBE_MS = 8_000;

/**
 * Keeps an open store verification page in sync when the partner (or AM)
 * resubmits onboarding fields / documents — without a manual browser refresh.
 *
 * Prefer Supabase postgres_changes; always keep a short poll so the UI still
 * updates if Realtime is unavailable for these tables.
 */
export function useStoreVerificationLiveSync(
  storeId: number | null | undefined,
  onRefresh: () => void | Promise<void>
) {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (storeId == null || !Number.isFinite(storeId) || storeId < 1) return;

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

    // Start fallback poll immediately so the first partner upload is not waiting on WS.
    startPoll(FALLBACK_POLL_MS);

    probeTimer = window.setTimeout(() => {
      if (!subscribed) startPoll(FALLBACK_POLL_MS);
    }, SUBSCRIBE_PROBE_MS);

    void (async () => {
      await hydrateBrowserSupabaseFromCookies();
      if (cancelled) return;

      const filter = `store_id=eq.${storeId}`;
      const ch = supabase.channel(`store_verification_live:${storeId}`);
      if (cancelled) {
        void supabase.removeChannel(ch);
        return;
      }
      channel = ch;

      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "merchant_store_onboarding_resubmissions",
          filter,
        },
        scheduleRefresh
      )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "store_verification_step_rejections",
            filter,
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "merchant_store_documents",
            filter,
          },
          scheduleRefresh
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "merchant_stores",
            filter: `id=eq.${storeId}`,
          },
          scheduleRefresh
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            subscribed = true;
            if (probeTimer != null) {
              window.clearTimeout(probeTimer);
              probeTimer = null;
            }
            // Keep a slower backup poll; Realtime may miss events if table is not published.
            startPoll(LIVE_BACKUP_POLL_MS);
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
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
  }, [storeId]);
}
