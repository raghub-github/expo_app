"use client";

import { useEffect } from "react";
import { reconnectRealtimeAfterBfCache } from "@/lib/auth/hydrate-browser-supabase";

/**
 * BFCache restore leaves Supabase Realtime websockets dead (browser console noise).
 * Reconnect once on pageshow when the page was restored from cache.
 */
export function BfCacheRealtimeGuard() {
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      reconnectRealtimeAfterBfCache();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  return null;
}
