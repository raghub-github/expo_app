"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fetchTickets, type TicketFilters } from "@/hooks/tickets/useTickets";
import { queryKeys } from "@/lib/queryKeys";

/** List view: no global postgres subscription (avoids load on every unified_tickets change). */
const POLL_INTERVAL_MS = 12_000;

async function drainTicketAutomationJobs(): Promise<void> {
  try {
    await fetch("/api/tickets/automation/process-jobs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 25 }),
    });
  } catch {
    // non-fatal; GET /api/tickets also drains jobs
  }
}

export type TicketsPollFilters = Omit<TicketFilters, "limit" | "offset">;

/**
 * “N new tickets” badge: count tickets that match the current list filters and were
 * newly created in DB after the last acknowledged time (load list, filter change, or click refresh).
 *
 * IMPORTANT: This must NOT increase for status changes/priority updates on existing tickets.
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

  /** Poll new-ticket badge + lightly refresh list/dashboard caches (no global Realtime). */
  useEffect(() => {
    if (!listReady) return;
    const id = window.setInterval(() => {
      void (async () => {
        await drainTicketAutomationJobs();
        void runPoll();
        void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.lists() });
        void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.helpdeskDashboard() });
      })();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [listReady, runPoll, queryClient]);

  return {
    hasNewTickets: newTicketsCount > 0,
    newTicketsCount,
    clearNewTickets,
  };
}
