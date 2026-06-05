import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { computeTicketCopresenceLive, type TicketPresenceRole } from "@/lib/ticketPresence";

/**
 * Supabase Presence on `ticket_presence_<numericId>` — same channel topic as dashboard.
 * Shows "live" only when merchant + another role (e.g. agent) are in the room.
 */
export function useTicketCopresence(options: {
  ticketNumericId: number | null;
  /** Supabase Auth user id (UUID) — must match dashboard presence keys. */
  presenceUserId: string | null;
  role?: TicketPresenceRole;
  displayName?: string;
  enabled: boolean;
}) {
  const { ticketNumericId, presenceUserId, role = "merchant", displayName = "", enabled } = options;
  const [copresenceLive, setCopresenceLive] = useState(false);
  const refreshRef = useRef<(ch: RealtimeChannel) => void>(() => {});
  const displayNameRef = useRef(displayName);
  displayNameRef.current = displayName;

  const refresh = useCallback(
    (ch: RealtimeChannel) => {
      setCopresenceLive(computeTicketCopresenceLive(ch.presenceState() as Record<string, unknown[]>, role));
    },
    [role]
  );
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled || ticketNumericId == null || ticketNumericId < 1 || !presenceUserId?.trim()) {
      setCopresenceLive(false);
      return;
    }

    const supabase = getSupabaseAuth();
    if (!supabase) {
      setCopresenceLive(false);
      return;
    }

    const channelName = `ticket_presence_${ticketNumericId}`;
    const realtimeTopic = `realtime:${channelName}`;

    // Re-subscribing the same topic reuses an already-subscribed channel; presence
    // handlers cannot be added after subscribe() — remove any stale channel first.
    for (const existing of supabase.getChannels()) {
      if (existing.topic === realtimeTopic) {
        void supabase.removeChannel(existing);
      }
    }

    const channel = supabase.channel(channelName, {
      config: { presence: { key: presenceUserId.trim() } },
    });

    channel.on("presence", { event: "sync" }, () => {
      refreshRef.current(channel);
    });
    channel.on("presence", { event: "join" }, () => {
      refreshRef.current(channel);
    });
    channel.on("presence", { event: "leave" }, () => {
      refreshRef.current(channel);
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        try {
          await channel.track({
            user_id: presenceUserId.trim(),
            role,
            name: displayNameRef.current.trim(),
          });
        } catch {
          /* ignore */
        }
        refreshRef.current(channel);
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setCopresenceLive(false);
      }
    });

    return () => {
      setCopresenceLive(false);
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
  }, [enabled, ticketNumericId, presenceUserId, role]);

  return { copresenceLive };
}
