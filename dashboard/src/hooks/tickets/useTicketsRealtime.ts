"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTickets, type TicketFilters } from "@/hooks/tickets/useTickets";
/** List view: no global postgres subscription (avoids load on every unified_tickets change). */
const POLL_INTERVAL_MS = 12_000;
/** Avoid stacking long-running process-jobs calls that exhaust the DB pool. */
const AUTOMATION_DRAIN_TIMEOUT_MS = 8_000;
let automationDrainInFlight = false;

async function drainTicketAutomationJobs(): Promise<void> {
  if (automationDrainInFlight) return;
  automationDrainInFlight = true;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTOMATION_DRAIN_TIMEOUT_MS);
  try {
    await fetch("/api/tickets/automation/process-jobs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 10 }),
      signal: controller.signal,
    });
  } catch {
    // non-fatal; GET /api/tickets also drains jobs in background
  } finally {
    window.clearTimeout(timeoutId);
    automationDrainInFlight = false;
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
  const [newTicketsCount, setNewTicketsCount] = useState(0);  const ackTimeIsoRef = useRef<string | null>(null);
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
        // Do not invalidate the main list on every poll — that caused background
        // refetch failures ("not_found") while stale snapshot data stayed visible.
        // Agents use the "N new tickets" pill + manual refresh to reload the list.
      })();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [listReady, runPoll]);
  return {
    hasNewTickets: newTicketsCount > 0,
    newTicketsCount,
    clearNewTickets,
  };
}
