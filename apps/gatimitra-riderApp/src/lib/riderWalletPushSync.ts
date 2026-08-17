import type { QueryClient } from "@tanstack/react-query";
import { EARNINGS_QUERY_KEY } from "@/src/hooks/useEarnings";
import {
  applyRiderWalletFreezeLive,
  parseRiderNumericId,
} from "@/src/hooks/useRiderWalletFreezeLive";
import { invalidateRiderBankStatusQueries } from "@/src/hooks/useRiderBankStatusLive";

/** Soft refetch after wallet / account / penalty push — no extra polling loops. */
export function invalidateRiderWalletQueries(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: ["rider", "earnings"] });
  void queryClient.invalidateQueries({ queryKey: ["rider", "ledger"] });
  void queryClient.invalidateQueries({ queryKey: ["rider", "wallet"] });
  void queryClient.invalidateQueries({ queryKey: ["rider", "duty"] });
}

function pushCodeFromData(data: Record<string, unknown>): string {
  return String(
    data.template_code ?? data.gmType ?? data.type ?? data.event ?? "",
  ).toUpperCase();
}

/**
 * Foreground push → instant freeze UI + wallet/ledger/duty refresh.
 * Returns true when the payload was a wallet/account/penalty alert.
 */
export function handleRiderWalletRelatedPush(
  queryClient: QueryClient,
  session: { riderId?: string; userId?: string } | null,
  data: Record<string, unknown>,
  body?: string | null,
): boolean {
  const code = pushCodeFromData(data);
  if (!code) return false;

  const riderId = parseRiderNumericId(session);
  const isWalletUnfrozen =
    code.includes("WALLET_UNFROZEN") || code === "RIDER_WALLET_UNFROZEN";
  const isWalletFrozen =
    !isWalletUnfrozen &&
    (code.includes("WALLET_FROZEN") || code === "RIDER_WALLET_FROZEN");
  const isPenalty = code.includes("PENALTY") || code === "RIDER_PENALTY";
  const isBankStatus =
    code.includes("BANK_REJECT") ||
    code.includes("BANK_APPROV") ||
    code === "RIDER_BANK_REJECTED" ||
    code === "RIDER_BANK_APPROVED";
  const isAccount =
    isBankStatus ||
    code.includes("BLACKLIST") ||
    code.includes("SUSPEND") ||
    code.includes("REACTIVAT") ||
    code.includes("DEACTIVAT") ||
    code === "RIDER_BLACKLISTED" ||
    code === "RIDER_ACCOUNT_DEACTIVATED" ||
    code === "RIDER_ACCOUNT_ACTIVATED" ||
    code === "ACCOUNT_SUSPENDED" ||
    code === "ACCOUNT_REACTIVATED";

  if (!isWalletFrozen && !isWalletUnfrozen && !isPenalty && !isAccount) {
    return false;
  }

  if (riderId != null && (isWalletFrozen || isWalletUnfrozen)) {
    const reason =
      typeof data.reason === "string" && data.reason.trim()
        ? data.reason.trim()
        : typeof body === "string" && body.trim()
          ? body.trim()
          : null;
    applyRiderWalletFreezeLive(
      queryClient,
      riderId,
      isWalletFrozen,
      isWalletFrozen ? reason : null,
    );
  }

  // Always soft-refetch for balance / restrictions / duty banners.
  invalidateRiderWalletQueries(queryClient);
  void queryClient.invalidateQueries({ queryKey: [...EARNINGS_QUERY_KEY] });
  if (isBankStatus || isAccount || isPenalty) {
    invalidateRiderBankStatusQueries(queryClient);
  }

  return true;
}
