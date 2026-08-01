/**
 * Force-refresh GatiCash balance + transaction lists app-wide.
 * Updates React Query cache and AsyncStorage so home pill / wallet page
 * stay in sync even when the wallet screen is not open.
 */

import type { QueryClient } from "@tanstack/react-query";
import { WALLET_BALANCE_QUERY_KEY } from "@/hooks/useWalletBalance";
import { writeWalletBalanceCache } from "@/lib/walletBalanceCache";
import { walletService } from "@/services/wallet.service";

export async function refreshCustomerWallet(queryClient: QueryClient): Promise<void> {
  try {
    const data = await walletService.getBalance();
    void writeWalletBalanceCache(data);
    queryClient.setQueryData(WALLET_BALANCE_QUERY_KEY, data);
  } catch {
    // Keep last known balance — network blips must not blank the pill.
  }
  void queryClient.invalidateQueries({
    queryKey: ["wallet", "transactions"],
    refetchType: "active",
  });
}

/** True when a push payload implies a wallet credit/debit may have landed. */
export function isWalletAffectingPush(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  const code = String(
    data.gmType ?? data.template_code ?? data.templateCode ?? data.type ?? ""
  )
    .trim()
    .toUpperCase();
  if (!code) return false;
  return (
    code.includes("WALLET") ||
    code.includes("GATICASH") ||
    code.includes("REFUND") ||
    code === "ORDER_CANCELLED_REFUND_ELIGIBLE" ||
    code === "CUSTOMER_REFUND_INITIATED" ||
    code === "CUSTOMER_WALLET_UPDATED"
  );
}
