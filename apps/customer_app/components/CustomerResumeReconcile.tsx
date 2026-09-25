/**
 * App-level resume reconciliation. Not owned by Home.
 * Android will not keep JS running in the background; this runs when the
 * process is active again. Cached UI stays until a fetch replaces it.
 */
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { debouncedInvalidateFoodHomeListingQueries } from "@/lib/invalidateFoodHomeLocationQueries";

/** Ignore quick app-switch flickers. */
const MIN_AWAY_MS = 20_000;
const WEATHER_MAX_AGE_MS = 30 * 60 * 1000;

function weatherCacheIsStale(queryClient: ReturnType<typeof useQueryClient>): boolean {
  const queries = queryClient.getQueryCache().findAll({ queryKey: ["weather"] });
  if (queries.length === 0) return false;
  const now = Date.now();
  return queries.some((q) => {
    const updated = q.state.dataUpdatedAt;
    return !updated || now - updated > WEATHER_MAX_AGE_MS;
  });
}

export function CustomerResumeReconcile() {
  const queryClient = useQueryClient();
  const awayAtRef = useRef<number | null>(null);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== "active") {
        if (awayAtRef.current == null) awayAtRef.current = Date.now();
        return;
      }
      const awayMs = awayAtRef.current != null ? Date.now() - awayAtRef.current : 0;
      awayAtRef.current = null;
      if (awayMs < MIN_AWAY_MS) return;

      // Listings already rate-limit to once a minute inside the helper.
      debouncedInvalidateFoodHomeListingQueries(queryClient);

      if (weatherCacheIsStale(queryClient)) {
        void queryClient.invalidateQueries({
          queryKey: ["weather"],
          refetchType: "active",
        });
      }

      void queryClient.invalidateQueries({
        queryKey: ["my-orders"],
        refetchType: "active",
      });
    };

    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [queryClient]);

  return null;
}
