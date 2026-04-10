import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { computeTicketCopresenceLive, type TicketPresenceRole } from "@/lib/ticketPresence";

/**
 * Supabase Presence on `ticket_<numericId>` — same channel topic as dashboard postgres + presence.
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

    // Must match dashboard `ticketPresenceRealtimeTopic` — separate from postgres `ticket_<id>` channel.
    const channelName = `ticket_presence_${ticketNumericId}`;
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
            name: displayName.trim(),
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
      void supabase.removeChannel(channel);
    };
  }, [enabled, ticketNumericId, presenceUserId, role, displayName]);

  return { copresenceLive };
}
