import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { AppState, type AppStateStatus } from "react-native";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { applySupabaseRealtimeAuth } from "@/lib/supabaseRealtimeAuth";
import { refreshMerchantHomeAdsNow } from "@/services/homeAdsApi";
import { useAuth } from "@/context/AuthContext";

const DEBOUNCE_MS = 350;
/** Only while realtime is NOT subscribed — avoid dual realtime+poll heat. */
const FALLBACK_POLL_MS = 60_000;

/**
 * Instant Home Ads refresh when Super Admin creates / enables / disables merchant ads.
 * Primary: postgres_changes on public.home_ads (audience=merchant).
 * Fallback: soft poll only if the realtime channel never becomes SUBSCRIBED.
 */
export function useMerchantHomeAdsRealtime(enabled = true) {
  const { token } = useAuth();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const supabase = getSupabaseAuth();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;
    let realtimeLive = false;

    const clearPoll = () => {
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
    };

    const runRefresh = () => {
      if (cancelled) return;
      void refreshMerchantHomeAdsNow();
    };

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        runRefresh();
      }, DEBOUNCE_MS);
    };

    const armFallbackPoll = () => {
      if (pollId || realtimeLive) return;
      pollId = setInterval(() => {
        if (AppState.currentState !== "active") return;
        if (realtimeLive) {
          clearPoll();
          return;
        }
        runRefresh();
      }, FALLBACK_POLL_MS);
    };

    if (supabase) {
      applySupabaseRealtimeAuth(supabase, token);
      const topic = `merchant_home_ads:${Date.now().toString(36)}`;
      try {
        channel = supabase
          .channel(topic)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "home_ads",
              filter: "audience=eq.merchant",
            },
            scheduleRefresh
          )
          .subscribe((status) => {
            if (cancelled) return;
            if (status === "SUBSCRIBED") {
              realtimeLive = true;
              clearPoll();
            } else if (
              status === "CHANNEL_ERROR" ||
              status === "TIMED_OUT" ||
              status === "CLOSED"
            ) {
              realtimeLive = false;
              armFallbackPoll();
            }
          });
      } catch {
        channel = null;
        armFallbackPoll();
      }
    } else {
      armFallbackPoll();
    }

    // Brief grace: if subscribe never reports, still keep a slow safety net.
    const grace = setTimeout(() => {
      if (!cancelled && !realtimeLive) armFallbackPoll();
    }, 8_000);

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") runRefresh();
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      cancelled = true;
      sub.remove();
      clearTimeout(grace);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearPoll();
      if (channel && supabase) {
        void supabase.removeChannel(channel);
      }
    };
  }, [enabled, token]);
}
