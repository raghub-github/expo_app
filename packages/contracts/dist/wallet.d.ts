import { z } from "zod";
export declare const WalletTransactionDirection: z.ZodEnum<{
    CREDIT: "CREDIT";
    DEBIT: "DEBIT";
}>;
export type WalletTransactionDirection = z.infer<typeof WalletTransactionDirection>;
export declare const WalletTransactionCategory: z.ZodEnum<{
    ORDER_EARNING: "ORDER_EARNING";
    ORDER_ADJUSTMENT: "ORDER_ADJUSTMENT";
    REFUND_REVERSAL: "REFUND_REVERSAL";
    FAILED_WITHDRAWAL_REVERSAL: "FAILED_WITHDRAWAL_REVERSAL";
    BONUS: "BONUS";
    CASHBACK: "CASHBACK";
    MANUAL_CREDIT: "MANUAL_CREDIT";
    SUBSCRIPTION_REFUND: "SUBSCRIPTION_REFUND";
    WITHDRAWAL: "WITHDRAWAL";
    PENALTY: "PENALTY";
    SUBSCRIPTION_FEE: "SUBSCRIPTION_FEE";
    COMMISSION_DEDUCTION: "COMMISSION_DEDUCTION";
    ADJUSTMENT: "ADJUSTMENT";
    REFUND_TO_CUSTOMER: "REFUND_TO_CUSTOMER";
    MANUAL_DEBIT: "MANUAL_DEBIT";
    TAX_ADJUSTMENT: "TAX_ADJUSTMENT";
    ORDER_LOCK: "ORDER_LOCK";
    ORDER_RELEASE: "ORDER_RELEASE";
    TDS_DEBIT: "TDS_DEBIT";
    GST_DEBIT: "GST_DEBIT";
    GST_CREDIT: "GST_CREDIT";
    WITHDRAWAL_REVERSAL: "WITHDRAWAL_REVERSAL";
    REFUND_DEBIT: "REFUND_DEBIT";
    PENALTY_REVERSAL: "PENALTY_REVERSAL";
    ADJUSTMENT_CREDIT: "ADJUSTMENT_CREDIT";
    ADJUSTMENT_DEBIT: "ADJUSTMENT_DEBIT";
    COMMISSION_DEBIT: "COMMISSION_DEBIT";
    HOLD_LOCK: "HOLD_LOCK";
    HOLD_RELEASE: "HOLD_RELEASE";
    FAILED_SETTLEMENT_REVERSAL: "FAILED_SETTLEMENT_REVERSAL";
    SETTLEMENT_REVERSAL: "SETTLEMENT_REVERSAL";
    CHARGEBACK: "CHARGEBACK";
    PAYOUT_HOLD: "PAYOUT_HOLD";
    PAYOUT_RELEASE: "PAYOUT_RELEASE";
    ONBOARDING_FEE: "ONBOARDING_FEE";
    SUBSCRIPTION_DEBIT: "SUBSCRIPTION_DEBIT";
}>;
export type WalletTransactionCategory = z.infer<typeof WalletTransactionCategory>;
export declare const CREDIT_CATEGORIES: WalletTransactionCategory[];
export declare const DEBIT_CATEGORIES: WalletTransactionCategory[];
export declare const WalletBalanceType: z.ZodEnum<{
    AVAILABLE: "AVAILABLE";
    PENDING: "PENDING";
    HOLD: "HOLD";
    RESERVE: "RESERVE";
    LOCKED: "LOCKED";
}>;
export type WalletBalanceType = z.infer<typeof WalletBalanceType>;
export declare const WalletReferenceType: z.ZodEnum<{
    WITHDRAWAL: "WITHDRAWAL";
    PENALTY: "PENALTY";
    ORDER: "ORDER";
    SUBSCRIPTION: "SUBSCRIPTION";
    SYSTEM: "SYSTEM";
    ADMIN: "ADMIN";
    REFUND: "REFUND";
    ONBOARDING: "ONBOARDING";
}>;
export type WalletReferenceType = z.infer<typeof WalletReferenceType>;
export declare const WalletStatusType: z.ZodEnum<{
    ACTIVE: "ACTIVE";
    SUSPENDED: "SUSPENDED";
    FROZEN: "FROZEN";
    BLOCKED: "BLOCKED";
}>;
export type WalletStatusType = z.infer<typeof WalletStatusType>;
export declare const PayoutRequestStatusType: z.ZodEnum<{
    PENDING: "PENDING";
    APPROVED: "APPROVED";
    PROCESSING: "PROCESSING";
    COMPLETED: "COMPLETED";
    FAILED: "FAILED";
    CANCELLED: "CANCELLED";
    REVERSED: "REVERSED";
}>;
export type PayoutRequestStatusType = z.infer<typeof PayoutRequestStatusType>;
export declare const LedgerEntryStatus: z.ZodEnum<{
    PENDING: "PENDING";
    COMPLETED: "COMPLETED";
    FAILED: "FAILED";
    REVERSED: "REVERSED";
}>;
export type LedgerEntryStatus = z.infer<typeof LedgerEntryStatus>;
export declare const WalletSummarySchema: z.ZodObject<{
    wallet_id: z.ZodNumber;
    available_balance: z.ZodNumber;
    pending_balance: z.ZodNumber;
    hold_balance: z.ZodNumber;
    reserve_balance: z.ZodNumber;
    locked_balance: z.ZodNumber;
    pending_settlement: z.ZodNumber;
    lifetime_credit: z.ZodNumber;
    lifetime_debit: z.ZodNumber;
    total_earned: z.ZodNumber;
    total_withdrawn: z.ZodNumber;
    total_penalty: z.ZodNumber;
    total_commission_deducted: z.ZodNumber;
    status: z.ZodEnum<{
        ACTIVE: "ACTIVE";
        SUSPENDED: "SUSPENDED";
        FROZEN: "FROZEN";
        BLOCKED: "BLOCKED";
    }>;
    today_earning: z.ZodNumber;
    yesterday_earning: z.ZodNumber;
    pending_withdrawal_total: z.ZodNumber;
    locked_settlement_total: z.ZodOptional<z.ZodNumber>;
    withdrawable_balance: z.ZodOptional<z.ZodNumber>;
    total_balance: z.ZodOptional<z.ZodNumber>;
    settlement_paused: z.ZodOptional<z.ZodBoolean>;
    delivered_today: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>;
export type WalletSummary = z.infer<typeof WalletSummarySchema>;
export declare const LedgerEntrySchema: z.ZodObject<{
    id: z.ZodNumber;
    direction: z.ZodEnum<{
        CREDIT: "CREDIT";
        DEBIT: "DEBIT";
    }>;
    category: z.ZodString;
    balance_type: z.ZodString;
    amount: z.ZodNumber;
    balance_before: z.ZodNullable<z.ZodNumber>;
    balance_after: z.ZodNumber;
    reference_type: z.ZodString;
    reference_id: z.ZodNullable<z.ZodNumber>;
    reference_extra: z.ZodNullable<z.ZodString>;
    description: z.ZodNullable<z.ZodString>;
    metadata: z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    status: z.ZodNullable<z.ZodString>;
    order_id: z.ZodNullable<z.ZodNumber>;
    gst_amount: z.ZodNullable<z.ZodNumber>;
    commission_amount: z.ZodNullable<z.ZodNumber>;
    tds_amount: z.ZodNullable<z.ZodNumber>;
    created_at: z.ZodString;
    formatted_order_id: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, z.core.$strip>;
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;
export declare const LedgerQueryOptionsSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    offset: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    from: z.ZodOptional<z.ZodString>;
    to: z.ZodOptional<z.ZodString>;
    direction: z.ZodOptional<z.ZodEnum<{
        CREDIT: "CREDIT";
        DEBIT: "DEBIT";
    }>>;
    category: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type LedgerQueryOptions = z.infer<typeof LedgerQueryOptionsSchema>;
export declare const PayoutQuoteSchema: z.ZodObject<{
    requested_amount: z.ZodNumber;
    commission_percentage: z.ZodNumber;
    commission_amount: z.ZodNumber;
    net_payout_amount: z.ZodNumber;
}, z.core.$strip>;
export type PayoutQuote = z.infer<typeof PayoutQuoteSchema>;
export declare const PayoutResultSchema: z.ZodObject<{
    payout_request_id: z.ZodNumber;
    amount: z.ZodNumber;
    commission_percentage: z.ZodNumber;
    commission_amount: z.ZodNumber;
    net_payout_amount: z.ZodNumber;
    status: z.ZodEnum<{
        PENDING: "PENDING";
        APPROVED: "APPROVED";
        PROCESSING: "PROCESSING";
        COMPLETED: "COMPLETED";
        FAILED: "FAILED";
        CANCELLED: "CANCELLED";
        REVERSED: "REVERSED";
    }>;
    hold_ledger_id: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
}, z.core.$strip>;
export type PayoutResult = z.infer<typeof PayoutResultSchema>;
export declare const CreateWithdrawalRequestSchema: z.ZodObject<{
    store_id: z.ZodUnion<[z.ZodString, z.ZodNumber]>;
    amount: z.ZodNumber;
    bank_account_id: z.ZodNumber;
}, z.core.$strip>;
export type CreateWithdrawalRequest = z.infer<typeof CreateWithdrawalRequestSchema>;
export declare const ReconciliationReportSchema: z.ZodObject<{
    wallet_id: z.ZodNumber;
    ledger_credit_sum: z.ZodNumber;
    ledger_debit_sum: z.ZodNumber;
    ledger_net: z.ZodNumber;
    wallet_total: z.ZodNumber;
    difference: z.ZodNumber;
    is_consistent: z.ZodBoolean;
    checked_at: z.ZodString;
}, z.core.$strip>;
export type ReconciliationReport = z.infer<typeof ReconciliationReportSchema>;
export declare const WALLET_CONSTANTS: {
    readonly MIN_WITHDRAWAL_AMOUNT: 100;
    readonly MAX_PENDING_WITHDRAWALS: 3;
    readonly DEFAULT_REFUND_WINDOW_DAYS: 3;
    readonly MAX_LEDGER_PAGE_SIZE: 100;
    readonly DEFAULT_LEDGER_PAGE_SIZE: 50;
};
export declare function roundMoney(n: number): number;
export declare function idempotencyKey(prefix: string, ...parts: (string | number)[]): string;
/** Unified balance buckets for merchant app, partnersite, and dashboard. */
export declare function normalizeMerchantWalletDisplay(summary: WalletSummary): {
    withdrawable: number;
    locked: number;
    hold: number;
    pending: number;
    total: number;
    settlement_paused: boolean;
};
//# sourceMappingURL=wallet.d.ts.map