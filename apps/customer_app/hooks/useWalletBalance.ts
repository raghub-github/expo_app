import { useQuery } from "@tanstack/react-query";
import { walletService } from "@/services/wallet.service";
import { useAuthStore } from "@/store/authStore";
import {
  readSyncWalletBalance,
  walletBalanceFallback,
  writeWalletBalanceCache,
} from "@/lib/walletBalanceCache";

export const WALLET_BALANCE_QUERY_KEY = ["wallet", "balance"] as const;

export function useWalletBalance() {
  const session = useAuthStore((s) => s.session);
  const hydrated = useAuthStore((s) => s.hydrated);

  return useQuery({
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
    enabled: hydrated && !!session,
    staleTime: 15_000,
    gcTime: 24 * 60 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
    placeholderData: () => readSyncWalletBalance() ?? walletBalanceFallback(),
    initialData: () => readSyncWalletBalance() ?? walletBalanceFallback(),
  });
}
