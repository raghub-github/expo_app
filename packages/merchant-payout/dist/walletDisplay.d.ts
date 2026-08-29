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
export declare function isMerchantFacingWithdrawalRequest(entry: MerchantLedgerVisibilityEntry): boolean;
/**
 * Internal hold-bucket moves — not merchant-facing "money in/out".
 * Merchants still see:
 * - HOLD_LOCK debit on AVAILABLE while withdrawal is pending/rejected/failed
 * - WITHDRAWAL when bank transfer completes (replaces the request row)
 * - FAILED_WITHDRAWAL_REVERSAL when funds are returned after reject/fail
 * Hidden: HOLD credit leg + HOLD_RELEASE + request debit once payout is COMPLETED.
 */
export declare function isInternalHoldLedgerMovement(entry: MerchantLedgerVisibilityEntry): boolean;
/**
 * Merchant-facing ledger visibility.
 * Show withdrawal request (AVAILABLE debit) + return credit; hide hold-bucket bookkeeping.
 */
export declare function isMerchantVisibleLedgerEntry(entry: MerchantLedgerVisibilityEntry): boolean;
export type WalletBalanceSource = {
    withdrawable_balance?: number | null;
    available_balance?: number | null;
};
/** Same field Home dashboard and Earnings must show. */
export declare function resolveWalletDisplayBalance(wallet: WalletBalanceSource | null | undefined): number;
/** Clean merchant-facing copy for withdrawal reject / fail credits. */
export declare function resolveWithdrawalReversalDisplayDescription(raw: string | null | undefined, metadata?: Record<string, unknown> | null): string;
/** Shared category labels (Partner Site + Merchant App). */
export declare const LEDGER_CATEGORY_LABELS: Record<string, string>;
export declare function resolveLedgerCategoryLabel(entry: {
    category: string;
    metadata?: Record<string, unknown> | null;
}): string;
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
export declare function resolveLedgerRowStatusBadge(entry: {
    direction?: string | null;
    category?: string | null;
    metadata?: Record<string, unknown> | null;
}): LedgerRowStatusBadge;
/** Remarks for the merchant-facing withdrawal request (HOLD_LOCK AVAILABLE debit) row. */
export declare function resolveWithdrawalRequestDisplayDescription(entry: MerchantLedgerVisibilityEntry): string;
//# sourceMappingURL=walletDisplay.d.ts.map