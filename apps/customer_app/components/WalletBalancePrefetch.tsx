import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/useWalletBalance";
import { walletService } from "@/services/wallet.service";
import {
  hydrateWalletBalanceQuery,
  writeWalletBalanceCache,
  walletBalanceFallback,
} from "@/lib/walletBalanceCache";
import { refreshCustomerWallet } from "@/lib/refreshCustomerWallet";

/**
 * Warm GatiCash balance after login and keep it fresh while the app is open:
 * - prefetch on session
 * - force refresh whenever the app returns to foreground
 */
export function WalletBalancePrefetch() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    if (!hydrated || !session) return;

    void hydrateWalletBalanceQuery(queryClient);
    void queryClient.prefetchQuery({
      queryKey: WALLET_BALANCE_QUERY_KEY,
      queryFn: async () => {
        try {
          const data = await walletService.getBalance();
          void writeWalletBalanceCache(data);
          return data;
        } catch {
          return walletBalanceFallback();
        }
      },
      staleTime: 15_000,
    });

    const refreshOnForeground = () => {
      const now = Date.now();
      // Dedupe rapid resume + focus double-fires; skip overlapping prefetch.
      if (now - lastRefreshAtRef.current < 8_000) return;
      lastRefreshAtRef.current = now;
      void refreshCustomerWallet(queryClient);
    };

    // Mark mount time so an immediate AppState "active" does not double-fetch.
    lastRefreshAtRef.current = Date.now();

    const onAppState = (next: AppStateStatus) => {
      if (next === "active") refreshOnForeground();
    };
    const sub = AppState.addEventListener("change", onAppState);
    return () => sub.remove();
  }, [hydrated, session, queryClient]);

  return null;
}
