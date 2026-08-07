import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { refreshCustomerServiceBlocks } from "@/lib/refreshCustomerServiceBlocks";

/**
 * Keep admin service blocks fresh while the app is open:
 * - initial fetch after login
 * - refresh whenever the app returns to foreground
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

    const refreshNow = () => {
      const now = Date.now();
      if (now - lastRefreshAtRef.current < 1_500) return;
      lastRefreshAtRef.current = now;
      void refreshCustomerServiceBlocks(queryClient);
    };

    refreshNow();

    const onAppState = (next: AppStateStatus) => {
      if (next === "active") refreshNow();
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [hydrated, session, queryClient]);

  return null;
}
