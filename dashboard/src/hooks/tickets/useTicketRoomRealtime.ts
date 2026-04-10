"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  computeTicketCopresenceLive,
  countDistinctTicketPresenceRoles,
  type TicketPresenceRole,
} from "@/lib/tickets/ticket-presence";
import {
  ticketPostgresRealtimeTopic,
  ticketPresenceRealtimeTopic,
} from "@/lib/tickets/ticket-realtime-topics";

/** Batch rapid postgres_events into one refetch (status + multi-message bursts). */
const INVALIDATE_DEBOUNCE_MS = 160;
/** If Realtime never reaches SUBSCRIBED, fall back to light polling. */
const SUBSCRIBE_PROBE_MS = 8_000;
/** When postgres subscription fails (e.g. RLS), poll often so the thread still updates. */
const FALLBACK_POLL_MS = 4_000;

export type TicketRoomSyncState = "idle" | "connecting" | "live" | "polling";

export type TicketRoomPresenceIdentity = {
  userId: string;
  role: TicketPresenceRole;
  displayName?: string;
};

/**
 * Two channels: postgres on `ticket_<id>`, copresence Presence on `ticket_presence_<id>`.
 * Agent identity must match bootstrap session (useAuth), not only client supabase.getUser().
 */
export function useTicketRoomRealtime(options: {
  ticketNumericId: number | null;
  ticketCacheId: string;
  presence: TicketRoomPresenceIdentity | null;
}) {
  const { ticketNumericId, ticketCacheId, presence } = options;
  const queryClient = useQueryClient();
  const [syncState, setSyncState] = useState<TicketRoomSyncState>("idle");
  const [copresenceLive, setCopresenceLive] = useState(false);
  const [distinctRoleCount, setDistinctRoleCount] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedRef = useRef(false);
  const probeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleInvalidate = useCallback(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tickets.detail(ticketCacheId),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tickets.activities(ticketCacheId),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.helpdeskDashboard() });
    }, INVALIDATE_DEBOUNCE_MS);
  }, [queryClient, ticketCacheId]);

  const refreshCopresence = useCallback((ch: RealtimeChannel, selfRole: TicketPresenceRole) => {
    const state = ch.presenceState() as Record<string, unknown[]>;
    setCopresenceLive(computeTicketCopresenceLive(state, selfRole));
    setDistinctRoleCount(countDistinctTicketPresenceRoles(state));
  }, []);

  const presenceUserId = presence?.userId?.trim() ?? "";
  const presenceRole = presence?.role ?? null;
  const presenceDisplayName = presence?.displayName?.trim() ?? "";
  const hasPresenceConfig = Boolean(presenceUserId && presenceRole);

  useEffect(() => {
    if (ticketNumericId == null || !Number.isInteger(ticketNumericId) || ticketNumericId < 1) {
      setSyncState("idle");
      return;
    }

    subscribedRef.current = false;
    setSyncState("connecting");

    if (probeRef.current) window.clearTimeout(probeRef.current);
    probeRef.current = window.setTimeout(() => {
      if (!subscribedRef.current) {
        setSyncState("polling");
      }
    }, SUBSCRIBE_PROBE_MS);

    const topic = ticketPostgresRealtimeTopic(ticketNumericId);
    const filterTicket = `ticket_id=eq.${ticketNumericId}`;
    const filterRow = `id=eq.${ticketNumericId}`;

    const channel = supabase.channel(topic);

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "unified_ticket_messages",
          filter: filterTicket,
        },
        scheduleInvalidate
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "unified_ticket_messages",
          filter: filterTicket,
        },
        scheduleInvalidate
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "unified_ticket_messages",
          filter: filterTicket,
        },
        scheduleInvalidate
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "unified_tickets",
          filter: filterRow,
        },
        scheduleInvalidate
      );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribedRef.current = true;
        if (probeRef.current) {
          window.clearTimeout(probeRef.current);
          probeRef.current = null;
        }
        setSyncState("live");
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        subscribedRef.current = false;
        setSyncState("polling");
      }
    });

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (probeRef.current) window.clearTimeout(probeRef.current);
      probeRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [ticketNumericId, ticketCacheId, scheduleInvalidate]);

  useEffect(() => {
    if (ticketNumericId == null || !Number.isInteger(ticketNumericId) || ticketNumericId < 1) {
      setCopresenceLive(false);
      setDistinctRoleCount(0);
      return;
    }
    if (!hasPresenceConfig || !presenceRole) {
      setCopresenceLive(false);
      setDistinctRoleCount(0);
      return;
    }

    const topic = ticketPresenceRealtimeTopic(ticketNumericId);
    const channel = supabase.channel(topic, {
      config: { presence: { key: presenceUserId } } as const,
    });

    const bump = () => refreshCopresence(channel, presenceRole);
    channel.on("presence", { event: "sync" }, bump);
    channel.on("presence", { event: "join" }, bump);
    channel.on("presence", { event: "leave" }, bump);

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channel.track({
            user_id: presenceUserId,
            role: presenceRole,
            name: presenceDisplayName,
          });
        } catch {
          /* track can fail if channel dropped */
        }
        bump();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setCopresenceLive(false);
        setDistinctRoleCount(0);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
      setCopresenceLive(false);
      setDistinctRoleCount(0);
    };
  }, [
    ticketNumericId,
    hasPresenceConfig,
    presenceUserId,
    presenceRole,
    presenceDisplayName,
    refreshCopresence,
  ]);

  useEffect(() => {
    if (ticketNumericId == null || !Number.isInteger(ticketNumericId) || ticketNumericId < 1) return;
    if (syncState !== "polling") return;

    const id = window.setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tickets.detail(ticketCacheId),
        refetchType: "active",
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tickets.activities(ticketCacheId),
        refetchType: "active",
      });
    }, FALLBACK_POLL_MS);

    return () => window.clearInterval(id);
  }, [ticketNumericId, ticketCacheId, syncState, queryClient]);

  return { syncState, copresenceLive, distinctRoleCount };
}
