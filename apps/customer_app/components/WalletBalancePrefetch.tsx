import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store/authStore";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/useWalletBalance";
import { walletService } from "@/services/wallet.service";
import {
  hydrateWalletBalanceQuery,
  writeWalletBalanceCache,
  walletBalanceFallback,
} from "@/lib/walletBalanceCache";

/** Warm GatiCash balance after login so the home header does not spin. */
export function WalletBalancePrefetch() {
  const queryClient = useQueryClient();
  const hydrated = useAuthStore((s) => s.hydrated);
  const session = useAuthStore((s) => s.session);

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
      staleTime: 60_000,
    });
  }, [hydrated, session, queryClient]);

  return null;
}
