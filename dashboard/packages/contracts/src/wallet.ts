import { z } from "zod";

// Enums (match PostgreSQL enums exactly)
export const WalletTransactionDirection = z.enum(["CREDIT", "DEBIT"]);
export type WalletTransactionDirection = z.infer<typeof WalletTransactionDirection>;

export const WalletTransactionCategory = z.enum([
  "ORDER_EARNING",
  "ORDER_ADJUSTMENT",
  "REFUND_REVERSAL",
  "FAILED_WITHDRAWAL_REVERSAL",
  "BONUS",
  "CASHBACK",
  "MANUAL_CREDIT",
  "SUBSCRIPTION_REFUND",
  "WITHDRAWAL",
  "PENALTY",
  "SUBSCRIPTION_FEE",
  "COMMISSION_DEDUCTION",
  "ADJUSTMENT",
  "REFUND_TO_CUSTOMER",
  "MANUAL_DEBIT",
  "TAX_ADJUSTMENT",
  "ORDER_LOCK",
  "ORDER_RELEASE",
  "TDS_DEBIT",
  "GST_DEBIT",
  "GST_CREDIT",
  "WITHDRAWAL_REVERSAL",
  "REFUND_DEBIT",
  "PENALTY_REVERSAL",
  "ADJUSTMENT_CREDIT",
  "ADJUSTMENT_DEBIT",
  "COMMISSION_DEBIT",
  "HOLD_LOCK",
  "HOLD_RELEASE",
  "FAILED_SETTLEMENT_REVERSAL",
  "ONBOARDING_FEE",
  "SUBSCRIPTION_DEBIT",
]);
export type WalletTransactionCategory = z.infer<typeof WalletTransactionCategory>;

export const CREDIT_CATEGORIES: WalletTransactionCategory[] = [
  "ORDER_EARNING",
  "ORDER_ADJUSTMENT",
  "REFUND_REVERSAL",
  "FAILED_WITHDRAWAL_REVERSAL",
  "BONUS",
  "CASHBACK",
  "MANUAL_CREDIT",
  "SUBSCRIPTION_REFUND",
  "GST_CREDIT",
  "ADJUSTMENT_CREDIT",
  "HOLD_RELEASE",
  "ORDER_RELEASE",
  "FAILED_SETTLEMENT_REVERSAL",
];

export const DEBIT_CATEGORIES: WalletTransactionCategory[] = [
  "WITHDRAWAL",
  "PENALTY",
  "SUBSCRIPTION_FEE",
  "COMMISSION_DEDUCTION",
  "ADJUSTMENT",
  "REFUND_TO_CUSTOMER",
  "MANUAL_DEBIT",
  "TAX_ADJUSTMENT",
  "ORDER_LOCK",
  "TDS_DEBIT",
  "GST_DEBIT",
  "WITHDRAWAL_REVERSAL",
  "REFUND_DEBIT",
  "PENALTY_REVERSAL",
  "ADJUSTMENT_DEBIT",
  "COMMISSION_DEBIT",
  "HOLD_LOCK",
  "ONBOARDING_FEE",
  "SUBSCRIPTION_DEBIT",
];

export const WalletBalanceType = z.enum(["AVAILABLE", "PENDING", "HOLD", "RESERVE", "LOCKED"]);
export type WalletBalanceType = z.infer<typeof WalletBalanceType>;

export const WalletReferenceType = z.enum([
  "ORDER",
  "WITHDRAWAL",
  "SUBSCRIPTION",
  "PENALTY",
  "SYSTEM",
  "ADMIN",
  "REFUND",
  "ONBOARDING",
]);
export type WalletReferenceType = z.infer<typeof WalletReferenceType>;

export const WalletStatusType = z.enum(["ACTIVE", "SUSPENDED", "FROZEN", "BLOCKED"]);
export type WalletStatusType = z.infer<typeof WalletStatusType>;

export const PayoutRequestStatusType = z.enum([
  "PENDING",
  "APPROVED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "REVERSED",
]);
export type PayoutRequestStatusType = z.infer<typeof PayoutRequestStatusType>;

export const LedgerEntryStatus = z.enum(["PENDING", "COMPLETED", "FAILED", "REVERSED"]);
export type LedgerEntryStatus = z.infer<typeof LedgerEntryStatus>;

export const WalletSummarySchema = z.object({
  wallet_id: z.number(),
  available_balance: z.number(),
  pending_balance: z.number(),
  hold_balance: z.number(),
  reserve_balance: z.number(),
  locked_balance: z.number(),
  pending_settlement: z.number(),
  lifetime_credit: z.number(),
  lifetime_debit: z.number(),
  total_earned: z.number(),
  total_withdrawn: z.number(),
  total_penalty: z.number(),
  total_commission_deducted: z.number(),
  status: WalletStatusType,
  today_earning: z.number(),
  yesterday_earning: z.number(),
  pending_withdrawal_total: z.number(),
});
export type WalletSummary = z.infer<typeof WalletSummarySchema>;

export const LedgerEntrySchema = z.object({
  id: z.number(),
  direction: WalletTransactionDirection,
  category: z.string(),
  balance_type: z.string(),
  amount: z.number(),
  balance_before: z.number().nullable(),
  balance_after: z.number(),
  reference_type: z.string(),
  reference_id: z.number().nullable(),
  reference_extra: z.string().nullable(),
  description: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  status: z.string().nullable(),
  order_id: z.number().nullable(),
  gst_amount: z.number().nullable(),
  commission_amount: z.number().nullable(),
  tds_amount: z.number().nullable(),
  created_at: z.string(),
  formatted_order_id: z.string().nullable().optional(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

export const LedgerQueryOptionsSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(50),
  offset: z.number().min(0).optional().default(0),
  from: z.string().optional(),
  to: z.string().optional(),
  direction: WalletTransactionDirection.optional(),
  category: z.string().optional(),
  search: z.string().optional(),
});
export type LedgerQueryOptions = z.infer<typeof LedgerQueryOptionsSchema>;

export const PayoutQuoteSchema = z.object({
  requested_amount: z.number(),
  commission_percentage: z.number(),
  commission_amount: z.number(),
  net_payout_amount: z.number(),
});
export type PayoutQuote = z.infer<typeof PayoutQuoteSchema>;

export const PayoutResultSchema = z.object({
  payout_request_id: z.number(),
  amount: z.number(),
  commission_percentage: z.number(),
  commission_amount: z.number(),
  net_payout_amount: z.number(),
  status: PayoutRequestStatusType,
  hold_ledger_id: z.number().nullable().optional(),
});
export type PayoutResult = z.infer<typeof PayoutResultSchema>;

export const CreateWithdrawalRequestSchema = z.object({
  store_id: z.string().or(z.number()),
  amount: z.number().min(100, "Amount must be at least ₹100"),
  bank_account_id: z.number().positive(),
});
export type CreateWithdrawalRequest = z.infer<typeof CreateWithdrawalRequestSchema>;

export const ReconciliationReportSchema = z.object({
  wallet_id: z.number(),
  ledger_credit_sum: z.number(),
  ledger_debit_sum: z.number(),
  ledger_net: z.number(),
  wallet_total: z.number(),
  difference: z.number(),
  is_consistent: z.boolean(),
  checked_at: z.string(),
});
export type ReconciliationReport = z.infer<typeof ReconciliationReportSchema>;

export const WALLET_CONSTANTS = {
  MIN_WITHDRAWAL_AMOUNT: 100,
  MAX_PENDING_WITHDRAWALS: 3,
  DEFAULT_REFUND_WINDOW_DAYS: 3,
  MAX_LEDGER_PAGE_SIZE: 100,
  DEFAULT_LEDGER_PAGE_SIZE: 50,
} as const;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function idempotencyKey(prefix: string, ...parts: (string | number)[]): string {
  return [prefix, ...parts].join("_");
}
