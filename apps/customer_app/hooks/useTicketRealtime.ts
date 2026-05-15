import { useEffect, useRef, useState, useCallback } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";

const DEBOUNCE_MS = 180;

/**
 * Mirror of merchant_app/hooks/useTicketMessagesRealtime — subscribes to the
 * same Supabase realtime channel ("ticket_<id>") the agent dashboard and
 * partnersite use. Any INSERT/UPDATE/DELETE on unified_ticket_messages for
 * this ticket, or UPDATE on unified_tickets, fires a debounced onStale callback.
 *
 * The customer-app screen passes a refetch function as onStale so the chat
 * pulls the new agent reply within ~200ms of the dashboard message insert,
 * without needing slow polling.
 */
export function useTicketRealtime(options: {
  ticketNumericId: number | null;
  enabled: boolean;
  onStale: () => void;
}) {
  const { ticketNumericId, enabled, onStale } = options;
  const [postgresLive, setPostgresLive] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onStaleRef = useRef(onStale);
  onStaleRef.current = onStale;

  const schedule = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      onStaleRef.current();
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    if (
      !enabled ||
      ticketNumericId == null ||
      !Number.isInteger(ticketNumericId) ||
      ticketNumericId < 1
    ) {
      setPostgresLive(false);
      return;
    }
    const supabase = getSupabaseAuth();
    if (!supabase) {
      setPostgresLive(false);
      return;
    }

    const topic = `ticket_${ticketNumericId}`;
    const filterTicket = `ticket_id=eq.${ticketNumericId}`;
    const filterRow = `id=eq.${ticketNumericId}`;

    const channel: RealtimeChannel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "unified_ticket_messages", filter: filterTicket },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "unified_ticket_messages", filter: filterTicket },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "unified_ticket_messages", filter: filterTicket },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "unified_tickets", filter: filterRow },
        schedule
      );

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") setPostgresLive(true);
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setPostgresLive(false);
      }
    });

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      setPostgresLive(false);
      void supabase.removeChannel(channel);
    };
  }, [enabled, ticketNumericId, schedule]);

  return { postgresLive };
}
