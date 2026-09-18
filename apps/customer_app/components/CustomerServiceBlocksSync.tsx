import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { CUSTOMER_SERVICE_BLOCKS_QUERY_KEY } from "@/hooks/useCustomerServiceBlocks";

/**
 * Keep admin service blocks fresh while the app is open:
 * - rely on useCustomerServiceBlocks for the initial fetch (shared RQ cache)
 * - invalidate on foreground so active observers refetch once (no parallel force-fetch)
 *
 * Polling interval lives on useCustomerServiceBlocks (refetchInterval).
 */
export function CustomerServiceBlocksSync() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    if (!hydrated || !session) return;

    const refreshOnForeground = () => {
      const now = Date.now();
      // Avoid resume storms + overlap with mount/focus observers.
      if (now - lastRefreshAtRef.current < 8_000) return;
      lastRefreshAtRef.current = now;
      void queryClient.invalidateQueries({
        queryKey: CUSTOMER_SERVICE_BLOCKS_QUERY_KEY,
        refetchType: "active",
      });
    };

    const onAppState = (next: AppStateStatus) => {
      if (next === "active") refreshOnForeground();
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [hydrated, session, queryClient]);

  return null;
}
