"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { hydrateBrowserSupabaseFromCookies } from "@/lib/auth/hydrate-browser-supabase";
import {
  invalidateTicketListCaches,
  patchTicketFromPostgresRow,
} from "@/lib/tickets/patch-ticket-list-cache";
import { fetchTickets, type TicketFilters } from "@/hooks/tickets/useTickets";

const POLL_INTERVAL_MS = 12_000;
const LIST_SYNC_DEBOUNCE_MS = 280;
const LIST_SAFETY_POLL_MS = 8_000;
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
 * List sync: Supabase postgres_changes on unified_tickets + messages (status/assignee/last reply),
 * plus “N new tickets” badge polling for INSERT-only counts.
 */
export function useTicketsRealtime(pollBase: TicketsPollFilters, listReady: boolean) {
  const queryClient = useQueryClient();
  const [newTicketsCount, setNewTicketsCount] = useState(0);
  const ackTimeIsoRef = useRef<string | null>(null);
  const pollBaseKeyRef = useRef<string>("");
  const listDebounceRef = useRef<number | null>(null);

  const pollBaseKey = JSON.stringify(pollBase);

  useEffect(() => {
    if (pollBaseKeyRef.current === pollBaseKey) return;
    pollBaseKeyRef.current = pollBaseKey;
    setNewTicketsCount(0);
    ackTimeIsoRef.current = new Date().toISOString();
  }, [pollBaseKey]);

  const scheduleListRefresh = useCallback(() => {
    if (listDebounceRef.current) window.clearTimeout(listDebounceRef.current);
    listDebounceRef.current = window.setTimeout(() => {
      listDebounceRef.current = null;
      invalidateTicketListCaches(queryClient);
    }, LIST_SYNC_DEBOUNCE_MS);
  }, [queryClient]);

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

  useEffect(() => {
    if (!listReady) return;
    void runPoll();
  }, [listReady, pollBaseKey, runPoll]);

  const clearNewTickets = useCallback(() => {
    setNewTicketsCount(0);
    ackTimeIsoRef.current = new Date().toISOString();
    invalidateTicketListCaches(queryClient);
  }, [queryClient]);

  /** Postgres sync — status/priority/assignee/last-message updates across tabs & detail view. */
  useEffect(() => {
    if (!listReady) return;

    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    void (async () => {
      await hydrateBrowserSupabaseFromCookies();
      if (cancelled) return;

      const ch = supabase.channel("helpdesk_tickets_list_sync");
      ch.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "unified_tickets" },
        scheduleListRefresh
      )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "unified_tickets" },
          (payload) => {
            const row = payload.new as Record<string, unknown> | null;
            if (row && typeof row === "object") {
              patchTicketFromPostgresRow(queryClient, row);
            }
            scheduleListRefresh();
          }
        )
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "unified_ticket_messages" },
          scheduleListRefresh
        );

      ch.subscribe();
      channel = ch;
    })();

    return () => {
      cancelled = true;
      if (listDebounceRef.current) window.clearTimeout(listDebounceRef.current);
      listDebounceRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [listReady, scheduleListRefresh]);

  /** Safety poll — keeps list/card status fresh if Realtime is silent. */
  useEffect(() => {
    if (!listReady) return;
    const id = window.setInterval(() => {
      void (async () => {
        await drainTicketAutomationJobs();
        void runPoll();
        scheduleListRefresh();
      })();
    }, LIST_SAFETY_POLL_MS);
    return () => window.clearInterval(id);
  }, [listReady, runPoll, scheduleListRefresh]);

  /** Slower poll for new-ticket badge only (createdAfter cursor). */
  useEffect(() => {
    if (!listReady) return;
    const id = window.setInterval(() => {
      void runPoll();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [listReady, runPoll]);

  return {
    hasNewTickets: newTicketsCount > 0,
    newTicketsCount,
    clearNewTickets,
  };
}
