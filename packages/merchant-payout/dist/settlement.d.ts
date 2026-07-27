import type { LedgerEntry } from "@gatimitra/contracts";
import type { MerchantPayoutSettlementClient, MerchantPayoutSettlementSummary, OrderDeductionLine, SettlementPartsInput } from "./types.js";
export declare function isCancellationStoreDebit(entry: LedgerEntry): boolean;
/** @deprecated Use sumRefundAdjustmentsFromLedger — kept for callers. */
export declare function sumCustomerCompensationFromLedger(entries: LedgerEntry[]): number;
export declare function sumRefundAdjustmentsFromLedger(entries: LedgerEntry[]): number;
export declare function sumPenaltiesFromLedger(entries: LedgerEntry[]): number;
export declare function sumManualDebitsFromLedger(entries: LedgerEntry[]): number;
export declare function sumChargebacksFromLedger(entries: LedgerEntry[]): number;
export declare function sumOtherMerchantCreditsFromLedger(entries: LedgerEntry[]): number;
export declare function sumOtherMerchantCreditPartsFromLedger(entries: LedgerEntry[]): {
    withdrawalReversalCredits: number;
    manualCredits: number;
    adjustmentCredits: number;
    gstCredits: number;
    penaltyReversalCredits: number;
};
export declare function sumCancellationCompensationFromLedger(entries: LedgerEntry[]): number;
export declare function sumMechanismFeeFromLedger(entries: LedgerEntry[]): number;
/**
 * Ledger SSOT formula:
 * Est. payout = A (ORDER_EARNING credits) + cancellation compensation + other credits − C
 * Store offer discounts (B) are informational only — never subtracted from Est. payout.
 * Mechanism fee is informational when A is already post-fee net (default).
 */
export declare function buildSummaryFromParts(parts: SettlementPartsInput): MerchantPayoutSettlementSummary;
/** Non-zero deduction rows for Order level deductions (C). */
export declare function buildOrderDeductionLines(summary: MerchantPayoutSettlementSummary): OrderDeductionLine[];
/** Ledger-only settlement — ORDER_EARNING credits are the sole source for A. */
export declare function computeSettlementFromLedgerEntries(entries: LedgerEntry[]): MerchantPayoutSettlementSummary;
export declare function mapSettlementToClient(summary: MerchantPayoutSettlementSummary): MerchantPayoutSettlementClient;
export declare function mapSettlementApiResponse(raw: Record<string, unknown>): MerchantPayoutSettlementClient;
export declare function summaryFromLockedSnapshot(row: Record<string, unknown>): MerchantPayoutSettlementSummary;
//# sourceMappingURL=settlement.d.ts.map