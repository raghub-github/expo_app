/**
 * Shared merchant wallet / ledger display helpers (single source of truth for App + Partner Site).
 */

export type MerchantLedgerVisibilityEntry = {
  category?: string | null;
  description?: string | null;
  balance_type?: string | null;
  direction?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * True when this HOLD_LOCK row is the merchant-facing withdrawal debit
 * (money leaving withdrawable / AVAILABLE balance when they request payout).
 */
export function isMerchantFacingWithdrawalRequest(
  entry: MerchantLedgerVisibilityEntry,
): boolean {
  const cat = String(entry.category ?? "").trim().toUpperCase();
  if (cat !== "HOLD_LOCK") return false;
  const direction = String(entry.direction ?? "").trim().toUpperCase();
  if (direction && direction !== "DEBIT") return false;
  const balanceType = String(entry.balance_type ?? "").trim().toUpperCase();
  // Empty/legacy rows without balance_type are treated as AVAILABLE withdrawable moves.
  return !balanceType || balanceType === "AVAILABLE" || balanceType === "LOCKED";
}

function payoutStatusFromEntry(entry: MerchantLedgerVisibilityEntry): string {
  const meta = entry.metadata ?? null;
  return String(meta?.payout_status ?? "").trim().toUpperCase();
}

/**
 * Internal hold-bucket moves — not merchant-facing "money in/out".
 * Merchants still see:
 * - HOLD_LOCK debit on AVAILABLE while withdrawal is pending/rejected/failed
 * - WITHDRAWAL when bank transfer completes (replaces the request row)
 * - FAILED_WITHDRAWAL_REVERSAL when funds are returned after reject/fail
 * Hidden: HOLD credit leg + HOLD_RELEASE + request debit once payout is COMPLETED.
 */
export function isInternalHoldLedgerMovement(
  entry: MerchantLedgerVisibilityEntry,
): boolean {
  const cat = String(entry.category ?? "").trim().toUpperCase();
  const desc = String(entry.description ?? "").toLowerCase();

  if (isMerchantFacingWithdrawalRequest(entry)) {
    // Completed payouts already show the WITHDRAWAL (bank transfer) row.
    if (payoutStatusFromEntry(entry) === "COMPLETED") return true;
    return false;
  }

  if (cat === "HOLD_LOCK" || cat === "HOLD_RELEASE") return true;

  return (
    desc.includes("withdrawal hold") ||
    desc.includes("release hold") ||
    desc.includes("hold released") ||
    desc.includes("withdrawal requested (processing)")
  );
}

/**
 * Merchant-facing ledger visibility.
 * Show withdrawal request (AVAILABLE debit) + return credit; hide hold-bucket bookkeeping.
 */
export function isMerchantVisibleLedgerEntry(
  entry: MerchantLedgerVisibilityEntry,
): boolean {
  return !isInternalHoldLedgerMovement(entry);
}

export type WalletBalanceSource = {
  withdrawable_balance?: number | null;
  available_balance?: number | null;
};

/** Same field Home dashboard and Earnings must show. */
export function resolveWalletDisplayBalance(wallet: WalletBalanceSource | null | undefined): number {
  if (!wallet) return 0;
  const w = wallet.withdrawable_balance ?? wallet.available_balance ?? 0;
  const n = Number(w);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

/** Clean merchant-facing copy for withdrawal reject / fail credits. */
export function resolveWithdrawalReversalDisplayDescription(
  raw: string | null | undefined,
  metadata?: Record<string, unknown> | null,
): string {
  const reason = String(metadata?.rejection_reason ?? metadata?.reason ?? "").trim();
  const desc = (raw ?? "").trim();

  let base = "Withdrawal rejected — funds returned to your wallet.";
  if (/withdrawal failed/i.test(desc) || (/funds released/i.test(desc) && !/rejected/i.test(desc))) {
    base = "Withdrawal failed — funds returned to your wallet.";
  } else if (desc && !/funds returned to wallet|FAILED_WITHDRAWAL_REVERSAL/i.test(desc)) {
    // Prefer explicit ledger copy when it already embeds Reason:
    const cleaned =
      desc.replace(/\s*#\d+\b/g, "").replace(/\s{2,}/g, " ").trim() || base;
    if (/reason\s*:/i.test(cleaned)) return cleaned;
    base = cleaned;
  }

  if (reason) {
    return `${base.replace(/\.$/, "")}. Reason: ${reason}`;
  }
  return base;
}

/** Shared category labels (Partner Site + Merchant App). */
export const LEDGER_CATEGORY_LABELS: Record<string, string> = {
  ORDER_EARNING: "Order Earning",
  ORDER_ADJUSTMENT: "Adjustment",
  WITHDRAWAL: "Withdrawal",
  PENALTY: "Penalty",
  SUBSCRIPTION_FEE: "Subscription",
  COMMISSION_DEDUCTION: "Commission",
  BONUS: "Bonus",
  CASHBACK: "Cashback",
  REFUND_REVERSAL: "Refund Reversal",
  MANUAL_CREDIT: "Manual Credit",
  MANUAL_DEBIT: "Manual Debit",
  ADJUSTMENT: "Adjustment",
  COMPENSATION_CREDIT: "Compensation Credit",
  COMPENSATION_RECOVERY: "Compensation Recovery",
  FAILED_WITHDRAWAL_REVERSAL: "Withdrawal returned",
  HOLD_LOCK: "Withdrawal",
  HOLD_RELEASE: "Withdrawal update",
};

export function resolveLedgerCategoryLabel(entry: {
  category: string;
  metadata?: Record<string, unknown> | null;
}): string {
  const meta = entry.metadata ?? null;
  const txType = String(meta?.transaction_type ?? "").trim().toUpperCase();
  if (txType && LEDGER_CATEGORY_LABELS[txType]) return LEDGER_CATEGORY_LABELS[txType];
  return LEDGER_CATEGORY_LABELS[entry.category] ?? entry.category.replace(/_/g, " ");
}

export type LedgerRowStatusBadge = {
  label: "Settled" | "Pending" | "Hold" | "Rejected" | "Debited" | "Credit" | "Debit" | "Cancelled";
  tone: "emerald" | "amber" | "yellow" | "red" | "slate";
};

/**
 * Merchant-facing Status column: withdrawals use Pending / Hold / Settled / Debited / Rejected
 * instead of generic Credit / Debit.
 *
 * The original HOLD_LOCK debit stays "Debited" after reject/fail — the return credit row is "Rejected".
 */
export function resolveLedgerRowStatusBadge(entry: {
  direction?: string | null;
  category?: string | null;
  metadata?: Record<string, unknown> | null;
}): LedgerRowStatusBadge {
  const meta = entry.metadata ?? null;
  if (
    meta?.entry_type === "order_cancellation" &&
    (meta?.balance_impact === "none" ||
      Number((meta?.cancellation_display as { creditAmount?: number } | undefined)?.creditAmount ?? 1) <= 0)
  ) {
    return { label: "Cancelled", tone: "amber" };
  }

  const cat = String(entry.category ?? "").trim().toUpperCase();
  const payoutStatus = String(meta?.payout_status ?? "").trim().toUpperCase();
  const direction = String(entry.direction ?? "").trim().toUpperCase();

  if (cat === "FAILED_WITHDRAWAL_REVERSAL" || cat === "WITHDRAWAL_REVERSAL") {
    return { label: "Rejected", tone: "red" };
  }

  if (cat === "WITHDRAWAL") {
    // Bank-transfer completion row
    if (["REJECTED", "CANCELLED", "FAILED", "RETURNED"].includes(payoutStatus)) {
      return { label: "Debited", tone: "slate" };
    }
    return { label: "Settled", tone: "emerald" };
  }

  if (isMerchantFacingWithdrawalRequest(entry)) {
    if (["APPROVED", "PROCESSING", "HOLD"].includes(payoutStatus)) {
      return { label: "Hold", tone: "yellow" };
    }
    if (["REJECTED", "CANCELLED", "FAILED", "RETURNED"].includes(payoutStatus)) {
      return { label: "Debited", tone: "slate" };
    }
    if (payoutStatus === "COMPLETED") {
      return { label: "Settled", tone: "emerald" };
    }
    return { label: "Pending", tone: "amber" };
  }

  if (direction === "CREDIT") return { label: "Credit", tone: "emerald" };
  return { label: "Debit", tone: "red" };
}

/** Remarks for the merchant-facing withdrawal request (HOLD_LOCK AVAILABLE debit) row. */
export function resolveWithdrawalRequestDisplayDescription(
  entry: MerchantLedgerVisibilityEntry,
): string {
  const status = payoutStatusFromEntry(entry);
  const meta = entry.metadata ?? null;
  const holdReason = String(
    meta?.hold_reason ?? meta?.approval_notes ?? meta?.hold_notes ?? "",
  ).trim();

  if (["APPROVED", "PROCESSING", "HOLD"].includes(status)) {
    return holdReason
      ? `Withdrawal on hold — ${holdReason}`
      : "Withdrawal on hold — awaiting release by admin.";
  }
  if (["REJECTED", "CANCELLED", "FAILED", "RETURNED"].includes(status)) {
    return "Withdrawal debited from your wallet.";
  }
  if (status === "COMPLETED") {
    return "Funds have been successfully transferred to the registered bank account.";
  }
  return "Withdrawal requested — funds held from your wallet.";
}
