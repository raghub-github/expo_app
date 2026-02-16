"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase/client";

const POLL_INTERVAL_MS = 18_000; // 18s - detect new tickets when Realtime is unavailable

/**
 * Shows "New Updated" badge when new tickets arrive:
 * 1) Supabase Realtime on public.unified_tickets (INSERT/UPDATE)
 * 2) Polling fallback: if currentTotal from server exceeds lastKnownTotal, show badge.
 * Pass currentTotal from the list (data.total). When user clicks badge, refetch then clearNewTickets.
 */
export function useTicketsRealtime(currentTotal: number) {
  const [newTicketsCount, setNewTicketsCount] = useState(0);
  const lastKnownTotalRef = useRef(currentTotal);

  const clearNewTickets = useCallback(() => {
    setNewTicketsCount(0);
    lastKnownTotalRef.current = currentTotal;
  }, [currentTotal]);

  // Keep ref in sync so polling can compare
  useEffect(() => {
    lastKnownTotalRef.current = currentTotal;
  }, [currentTotal]);

  // 1) Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`unified_tickets_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "unified_tickets",
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            setNewTicketsCount((n) => n + 1);
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn("[useTicketsRealtime] Realtime channel error - using polling fallback. Enable Realtime for unified_tickets in Supabase Dashboard > Database > Replication.");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // 2) Polling fallback so badge appears even when Realtime is not enabled
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/tickets?limit=1&offset=0", { credentials: "include" });
        const json = await res.json();
        if (!json.success || !json.data) return;
        const serverTotal = Number(json.data.total ?? 0);
        if (serverTotal > lastKnownTotalRef.current) {
          setNewTicketsCount((n) => Math.max(n, serverTotal - lastKnownTotalRef.current));
        }
      } catch {
        // ignore
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return {
    hasNewTickets: newTicketsCount > 0,
    newTicketsCount,
    clearNewTickets,
  };
}
