import { useCallback, useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { applySupabaseRealtimeAuth } from "@/lib/supabaseRealtimeAuth";

const DEBOUNCE_MS = 280;

/** Refetch customer ticket list when any of their tickets change status or get a new reply. */
export function useCustomerTicketsListRealtime(options: {
  enabled: boolean;
  authToken: string | null;
  onStale: () => void;
}) {
  const { enabled, authToken, onStale } = options;
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
    if (!enabled) return;

    const supabase = getSupabaseAuth();
    if (!supabase) return;

    applySupabaseRealtimeAuth(supabase, authToken);

    const channel: RealtimeChannel = supabase
      .channel("customer_tickets_list_sync")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "unified_tickets" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "unified_tickets" },
        schedule
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "unified_ticket_messages" },
        schedule
      );

    channel.subscribe();

    const safetyPoll = setInterval(() => {
      onStaleRef.current();
    }, 8_000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      clearInterval(safetyPoll);
      void supabase.removeChannel(channel);
    };
  }, [enabled, authToken, schedule]);
}
