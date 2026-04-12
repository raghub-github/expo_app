"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  computeTicketCopresenceLive,
  countDistinctTicketPresenceRoles,
  listOtherTicketAgentViewers,
  type TicketOtherAgentViewer,
  type TicketPresenceRole,
} from "@/lib/tickets/ticket-presence";
import {
  ticketPostgresRealtimeTopic,
  ticketPresenceRealtimeTopic,
} from "@/lib/tickets/ticket-realtime-topics";
import { hydrateBrowserSupabaseFromCookies } from "@/lib/auth/hydrate-browser-supabase";

/** Batch rapid postgres_events into one refetch (status + multi-message bursts). */
const INVALIDATE_DEBOUNCE_MS = 160;
/** If Realtime never reaches SUBSCRIBED, fall back to light polling (cold WS / slow auth). */
const SUBSCRIBE_PROBE_MS = 22_000;
/** When postgres subscription fails (e.g. RLS), poll often so the thread still updates. */
export const TICKET_ROOM_FALLBACK_POLL_MS = 4_000;

function serializeOtherAgentViewers(v: TicketOtherAgentViewer[]): string {
  return JSON.stringify(v.map((x) => [x.userId, x.displayName]));
}

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
  const [otherAgentViewers, setOtherAgentViewers] = useState<TicketOtherAgentViewer[]>([]);
  const otherAgentsSerializedRef = useRef(serializeOtherAgentViewers([]));
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

  const refreshCopresence = useCallback(
    (ch: RealtimeChannel, selfRole: TicketPresenceRole, selfUserId: string) => {
      const state = ch.presenceState() as Record<string, unknown[]>;
      setCopresenceLive(computeTicketCopresenceLive(state, selfRole));
      setDistinctRoleCount(countDistinctTicketPresenceRoles(state));
      const next = listOtherTicketAgentViewers(state, selfUserId);
      const ser = serializeOtherAgentViewers(next);
      if (ser !== otherAgentsSerializedRef.current) {
        otherAgentsSerializedRef.current = ser;
        setOtherAgentViewers(next);
      }
    },
    []
  );

  const presenceUserId = presence?.userId?.trim() ?? "";
  const presenceRole = presence?.role ?? null;
  const presenceDisplayName = presence?.displayName?.trim() ?? "";
  const hasPresenceConfig = Boolean(presenceUserId && presenceRole);

  useEffect(() => {
    if (ticketNumericId == null || !Number.isInteger(ticketNumericId) || ticketNumericId < 1) {
      setSyncState("idle");
      return;
    }

    let cancelled = false;
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

    let channel: RealtimeChannel | null = null;

    void (async () => {
      await hydrateBrowserSupabaseFromCookies();
      if (cancelled) return;

      const ch = supabase.channel(topic);
      if (cancelled) {
        void supabase.removeChannel(ch);
        return;
      }
      channel = ch;

      ch
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

      ch.subscribe((status) => {
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
    })();

    return () => {
      cancelled = true;
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
      if (probeRef.current) window.clearTimeout(probeRef.current);
      probeRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [ticketNumericId, ticketCacheId, scheduleInvalidate]);

  useEffect(() => {
    if (ticketNumericId == null || !Number.isInteger(ticketNumericId) || ticketNumericId < 1) {
      setCopresenceLive(false);
      setDistinctRoleCount(0);
      otherAgentsSerializedRef.current = serializeOtherAgentViewers([]);
      setOtherAgentViewers([]);
      return;
    }
    if (!hasPresenceConfig || !presenceRole) {
      setCopresenceLive(false);
      setDistinctRoleCount(0);
      otherAgentsSerializedRef.current = serializeOtherAgentViewers([]);
      setOtherAgentViewers([]);
      return;
    }

    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let presenceSubscribed = false;
    let unsubscribeAuth: (() => void) | null = null;

    void (async () => {
      await hydrateBrowserSupabaseFromCookies();
      if (cancelled) return;

      // Wait briefly for setSession after cookie hydrate so Realtime joins with a JWT (not anon).
      for (let attempt = 0; attempt < 8; attempt++) {
        const tok = (await supabase.auth.getSession()).data.session?.access_token;
        if (tok) break;
        await new Promise((r) => window.setTimeout(r, 120 * (attempt + 1)));
        if (cancelled) return;
      }

      const topic = ticketPresenceRealtimeTopic(ticketNumericId);
      const ch = supabase.channel(topic, {
        config: { presence: { key: presenceUserId } } as const,
      });
      if (cancelled) {
        void supabase.removeChannel(ch);
        return;
      }
      channel = ch;

      const bump = () => refreshCopresence(ch, presenceRole, presenceUserId);
      ch.on("presence", { event: "sync" }, bump);
      ch.on("presence", { event: "join" }, bump);
      ch.on("presence", { event: "leave" }, bump);

      const trackPayload = {
        user_id: presenceUserId,
        role: presenceRole,
        name: presenceDisplayName ? presenceDisplayName : undefined,
      };

      const doTrack = async () => {
        try {
          await ch.track(trackPayload);
        } catch {
          /* track can fail if channel dropped */
        }
        bump();
      };

      const {
        data: { subscription: authSubscription },
      } = supabase.auth.onAuthStateChange((event, session) => {
        if (cancelled || !presenceSubscribed) return;
        if (event === "SIGNED_OUT") return;
        if (!session?.access_token) return;
        void doTrack();
      });
      unsubscribeAuth = () => authSubscription.unsubscribe();

      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          presenceSubscribed = true;
          await doTrack();
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          presenceSubscribed = false;
          setCopresenceLive(false);
          setDistinctRoleCount(0);
          otherAgentsSerializedRef.current = serializeOtherAgentViewers([]);
          setOtherAgentViewers([]);
        }
      });
    })();

    return () => {
      cancelled = true;
      presenceSubscribed = false;
      unsubscribeAuth?.();
      unsubscribeAuth = null;
      if (channel) void supabase.removeChannel(channel);
      setCopresenceLive(false);
      setDistinctRoleCount(0);
      otherAgentsSerializedRef.current = serializeOtherAgentViewers([]);
      setOtherAgentViewers([]);
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
    }, TICKET_ROOM_FALLBACK_POLL_MS);

    return () => window.clearInterval(id);
  }, [ticketNumericId, ticketCacheId, syncState, queryClient]);

  return { syncState, copresenceLive, distinctRoleCount, otherAgentViewers };
}
