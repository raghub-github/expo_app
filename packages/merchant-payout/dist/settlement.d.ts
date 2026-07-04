import type { LedgerEntry } from "@gatimitra/contracts";
import type { MerchantPayoutSettlementClient, MerchantPayoutSettlementSummary, SettlementPartsInput } from "./types.js";
export declare function isCancellationStoreDebit(entry: LedgerEntry): boolean;
export declare function sumCustomerCompensationFromLedger(entries: LedgerEntry[]): number;
export declare function sumMechanismFeeFromLedger(entries: LedgerEntry[]): number;
/**
 * Core A − B − C payout formula.
 * payoutBase = merchantNetTotal (when credits exist) else delivered gross.
 * estimated_payout = max(0, payoutBase − restaurantDiscounts − customerCompensation + cancellationCompensation)
 */
export declare function buildSummaryFromParts(parts: SettlementPartsInput): MerchantPayoutSettlementSummary;
/** Ledger-only fallback when order_settlement_breakdown rows are missing. */
export declare function computeSettlementFromLedgerEntries(entries: LedgerEntry[]): MerchantPayoutSettlementSummary;
export declare function mapSettlementToClient(summary: MerchantPayoutSettlementSummary): MerchantPayoutSettlementClient;
export declare function mapSettlementApiResponse(raw: Record<string, unknown>): MerchantPayoutSettlementClient;
//# sourceMappingURL=settlement.d.ts.map