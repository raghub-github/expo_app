"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { fetchTickets, type TicketFilters } from "@/hooks/tickets/useTickets";
import { queryKeys } from "@/lib/queryKeys";

const POLL_INTERVAL_MS = 18_000;
const REALTIME_DEBOUNCE_MS = 800;

export type TicketsPollFilters = Omit<TicketFilters, "limit" | "offset">;

/**
 * “N new tickets” badge: count tickets that match the **current list filters** and were
 * created after the user’s last acknowledged time (load list, Apply filters, or click refresh).
 *
 * Not a global DB event counter — avoids dummy totals matching full ticket count.
 */
export function useTicketsRealtime(pollBase: TicketsPollFilters, listReady: boolean) {
  const queryClient = useQueryClient();
  const [newTicketsCount, setNewTicketsCount] = useState(0);
  const ackTimeIsoRef = useRef<string | null>(null);
  const pollBaseKeyRef = useRef<string>("");

  const pollBaseKey = JSON.stringify(pollBase);

  useEffect(() => {
    if (pollBaseKeyRef.current === pollBaseKey) return;
    pollBaseKeyRef.current = pollBaseKey;
    setNewTicketsCount(0);
    ackTimeIsoRef.current = new Date().toISOString();
  }, [pollBaseKey]);

  const runPoll = useCallback(async () => {
    if (!listReady || ackTimeIsoRef.current == null) return;
    try {
      const res = await fetchTickets({
        ...pollBase,
        limit: 1,
        offset: 0,
        createdAfter: ackTimeIsoRef.current,
      });
      const n = Number(res.total ?? 0);
      if (!Number.isFinite(n) || n <= 0) return;
      setNewTicketsCount((prev) => Math.max(prev, n));
    } catch {
      // ignore
    }
  }, [pollBase, listReady]);

  // One quick check when the list finishes loading or filters change (don’t wait 18s only).
  useEffect(() => {
    if (!listReady) return;
    void runPoll();
  }, [listReady, pollBaseKey, runPoll]);

  const clearNewTickets = useCallback(() => {
    setNewTicketsCount(0);
    ackTimeIsoRef.current = new Date().toISOString();
  }, []);

  useEffect(() => {
    if (!listReady) return;
    const id = window.setInterval(() => {
      void runPoll();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [listReady, runPoll]);

  useEffect(() => {
    if (!listReady) return;
    let debounce: number | null = null;
    const channel = supabase
      .channel(`tickets_activity_${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "unified_tickets" },
        () => {
          if (debounce) window.clearTimeout(debounce);
          debounce = window.setTimeout(() => {
            debounce = null;
            void runPoll();
            void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.lists() });
          }, REALTIME_DEBOUNCE_MS);
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.warn(
            "[useTicketsRealtime] Realtime error — polling still runs. Enable Replication for public.unified_tickets if you want faster updates."
          );
        }
      });

    return () => {
      if (debounce) window.clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [listReady, runPoll, queryClient]);

  return {
    hasNewTickets: newTicketsCount > 0,
    newTicketsCount,
    clearNewTickets,
  };
}
