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

/** New-ticket badge poll only (createdAfter cursor). */
const BADGE_POLL_INTERVAL_MS = 30_000;
const LIST_SYNC_DEBOUNCE_MS = 280;
/**
 * Safety refresh when Realtime is quiet — slower than before to avoid
 * stacking process-jobs + limit=1 + full list invalidations every 8s.
 */
const LIST_SAFETY_POLL_MS = 45_000;
/** Rare automation drain from the client (server list GET also drains in background). */
const AUTOMATION_DRAIN_INTERVAL_MS = 90_000;
const AUTOMATION_DRAIN_TIMEOUT_MS = 8_000;
let automationDrainInFlight = false;

async function drainTicketAutomationJobs(signal?: AbortSignal): Promise<void> {
  if (automationDrainInFlight) return;
  automationDrainInFlight = true;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTOMATION_DRAIN_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetch("/api/tickets/automation/process-jobs", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 10 }),
      signal: controller.signal,
    });
    if (!res.ok && res.status !== 503) {
      return;
    }
  } catch {
    // non-fatal
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onAbort);
    automationDrainInFlight = false;
  }
}

export type TicketsPollFilters = Omit<TicketFilters, "limit" | "offset">;

/**
 * List sync: Supabase postgres_changes on unified_tickets + messages,
 * plus “N new tickets” badge polling for INSERT-only counts.
 *
 * When `listVisible` is false (ticket detail open, list CSS-hidden), all
 * polling and Realtime pause so detail navigation does not keep hammering APIs.
 */
export function useTicketsRealtime(
  pollBase: TicketsPollFilters,
  listReady: boolean,
  listVisible: boolean = true
) {
  const queryClient = useQueryClient();
  const [newTicketsCount, setNewTicketsCount] = useState(0);
  const ackTimeIsoRef = useRef<string | null>(null);
  const pollBaseKeyRef = useRef<string>("");
  const listDebounceRef = useRef<number | null>(null);
  const active = listReady && listVisible;

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

  const runPoll = useCallback(
    async (signal?: AbortSignal) => {
      if (!active || ackTimeIsoRef.current == null) return;
      try {
        const res = await fetchTickets(
          {
            ...pollBase,
            limit: 1,
            offset: 0,
            createdAfter: ackTimeIsoRef.current,
          },
          signal
        );
        if (signal?.aborted) return;
        const n = Number(res.total ?? 0);
        if (!Number.isFinite(n) || n <= 0) return;
        setNewTicketsCount((prev) => Math.max(prev, n));
      } catch {
        // ignore aborted / transient
      }
    },
    [pollBase, active]
  );

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void runPoll(controller.signal);
    return () => controller.abort();
  }, [active, pollBaseKey, runPoll]);

  const clearNewTickets = useCallback(() => {
    setNewTicketsCount(0);
    ackTimeIsoRef.current = new Date().toISOString();
    invalidateTicketListCaches(queryClient);
  }, [queryClient]);

  /** Postgres sync — pause while list is hidden under detail. */
  useEffect(() => {
    if (!active) return;

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
  }, [active, scheduleListRefresh, queryClient]);

  /** Safety list refresh only — no process-jobs here (avoids double drain with GET /api/tickets). */
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      scheduleListRefresh();
    }, LIST_SAFETY_POLL_MS);
    return () => window.clearInterval(id);
  }, [active, scheduleListRefresh]);

  /** Badge poll for new tickets since ack cursor. */
  useEffect(() => {
    if (!active) return;
    const controllerRef = { current: null as AbortController | null };
    const id = window.setInterval(() => {
      controllerRef.current?.abort();
      const c = new AbortController();
      controllerRef.current = c;
      void runPoll(c.signal);
    }, BADGE_POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      controllerRef.current?.abort();
    };
  }, [active, runPoll]);

  /** Infrequent automation drain — single controlled lifecycle, not every safety tick. */
  useEffect(() => {
    if (!active) return;
    const controllerRef = { current: null as AbortController | null };
    const id = window.setInterval(() => {
      controllerRef.current?.abort();
      const c = new AbortController();
      controllerRef.current = c;
      void drainTicketAutomationJobs(c.signal);
    }, AUTOMATION_DRAIN_INTERVAL_MS);
    return () => {
      window.clearInterval(id);
      controllerRef.current?.abort();
    };
  }, [active]);

  return {
    hasNewTickets: newTicketsCount > 0,
    newTicketsCount,
    clearNewTickets,
  };
}
