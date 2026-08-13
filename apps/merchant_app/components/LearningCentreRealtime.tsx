/**
 * Instant Learning Centre updates: Super Admin add / edit / remove
 * bumps learning_centre_signals; this listener refetches the merchant list.
 */

import { useEffect, useRef } from "react";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { emitLearningCentreSignal } from "@/lib/learningCentreSignalBus";

export default function LearningCentreRealtime() {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = getSupabaseAuth();
    if (!supabase) return;

    const scheduleRefresh = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        emitLearningCentreSignal();
      }, 120);
    };

    const channel = supabase
      .channel("learning-centre-signal")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "learning_centre_signals",
        },
        () => scheduleRefresh()
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      try {
        supabase.removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, []);

  return null;
}
