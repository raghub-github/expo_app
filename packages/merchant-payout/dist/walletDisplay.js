/**
 * Shared merchant wallet / ledger display helpers (single source of truth for App + Partner Site).
 */
/**
 * True when this HOLD_LOCK row is the merchant-facing withdrawal debit
 * (money leaving withdrawable / AVAILABLE balance when they request payout).
 */
export function isMerchantFacingWithdrawalRequest(entry) {
    const cat = String(entry.category ?? "").trim().toUpperCase();
    if (cat !== "HOLD_LOCK")
        return false;
    const direction = String(entry.direction ?? "").trim().toUpperCase();
    if (direction && direction !== "DEBIT")
        return false;
    const balanceType = String(entry.balance_type ?? "").trim().toUpperCase();
    // Empty/legacy rows without balance_type are treated as AVAILABLE withdrawable moves.
    return !balanceType || balanceType === "AVAILABLE" || balanceType === "LOCKED";
}
function payoutStatusFromEntry(entry) {
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
export function isInternalHoldLedgerMovement(entry) {
    const cat = String(entry.category ?? "").trim().toUpperCase();
    const desc = String(entry.description ?? "").toLowerCase();
    if (isMerchantFacingWithdrawalRequest(entry)) {
        // Completed payouts already show the WITHDRAWAL (bank transfer) row.
        if (payoutStatusFromEntry(entry) === "COMPLETED")
            return true;
        return false;
    }
    if (cat === "HOLD_LOCK" || cat === "HOLD_RELEASE")
        return true;
    return (desc.includes("withdrawal hold") ||
        desc.includes("release hold") ||
        desc.includes("hold released") ||
        desc.includes("withdrawal requested (processing)"));
}
/**
 * Merchant-facing ledger visibility.
 * Show withdrawal request (AVAILABLE debit) + return credit; hide hold-bucket bookkeeping.
 */
export function isMerchantVisibleLedgerEntry(entry) {
    return !isInternalHoldLedgerMovement(entry);
}
/** Same field Home dashboard and Earnings must show. */
export function resolveWalletDisplayBalance(wallet) {
    if (!wallet)
        return 0;
    const w = wallet.withdrawable_balance ?? wallet.available_balance ?? 0;
    const n = Number(w);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
/** Clean merchant-facing copy for withdrawal reject / fail credits. */
export function resolveWithdrawalReversalDisplayDescription(raw, metadata) {
    const reason = String(metadata?.rejection_reason ?? metadata?.reason ?? "").trim();
    const desc = (raw ?? "").trim();
    let base = "Withdrawal rejected — funds returned to your wallet.";
    if (/withdrawal failed/i.test(desc) || (/funds released/i.test(desc) && !/rejected/i.test(desc))) {
        base = "Withdrawal failed — funds returned to your wallet.";
    }
    else if (desc && !/funds returned to wallet|FAILED_WITHDRAWAL_REVERSAL/i.test(desc)) {
        // Prefer explicit ledger copy when it already embeds Reason:
        const cleaned = desc.replace(/\s*#\d+\b/g, "").replace(/\s{2,}/g, " ").trim() || base;
        if (/reason\s*:/i.test(cleaned))
            return cleaned;
        base = cleaned;
    }
    if (reason) {
        return `${base.replace(/\.$/, "")}. Reason: ${reason}`;
    }
    return base;
}
/** Shared category labels (Partner Site + Merchant App). */
export const LEDGER_CATEGORY_LABELS = {
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
export function resolveLedgerCategoryLabel(entry) {
    const meta = entry.metadata ?? null;
    const txType = String(meta?.transaction_type ?? "").trim().toUpperCase();
    if (txType && LEDGER_CATEGORY_LABELS[txType])
        return LEDGER_CATEGORY_LABELS[txType];
    return LEDGER_CATEGORY_LABELS[entry.category] ?? entry.category.replace(/_/g, " ");
}
