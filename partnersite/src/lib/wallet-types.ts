/**
 * Merchant Wallet types — canonical definitions shared across all three projects.
 * These MUST stay in sync with @gatimitra/contracts/src/wallet.ts.
 *
 * The partnersite is not in the monorepo workspaces, so we duplicate the types here.
 * Any change to wallet contracts MUST be reflected here.
 */

export interface WalletSummary {
  wallet_id: number;
  available_balance: number;
  pending_balance: number;
  hold_balance: number;
  reserve_balance: number;
  locked_balance: number;
  pending_settlement: number;
  lifetime_credit: number;
  lifetime_debit: number;
  total_earned: number;
  total_withdrawn: number;
  total_penalty: number;
  total_commission_deducted: number;
  status: "ACTIVE" | "SUSPENDED" | "FROZEN" | "BLOCKED";
  today_earning: number;
  yesterday_earning: number;
  pending_withdrawal_total: number;
  in_process_withdrawal_total?: number;
  /** Sum of refund-window-held earnings; UI shows separately from available. */
  locked_settlement_total?: number;
  /** Total of available + pending + locked + hold; falls back when not present. */
  total_balance?: number;
  /** Withdrawable subset after holds — distinct from raw available_balance. */
  withdrawable_balance?: number;
  /** True when admin has paused payouts for the merchant. */
  settlement_paused?: boolean;
  isFrozen?: boolean;
  freezeReason?: string | null;
  frozenAt?: string | null;
  min_withdrawal_amount?: number;
  max_withdrawal_amount?: number;
}

export interface LedgerEntry {
  id: number;
  direction: "CREDIT" | "DEBIT";
  category: string;
  balance_type: string;
  amount: number;
  balance_before: number | null;
  balance_after: number;
  reference_type: string;
  reference_id: number | null;
  reference_extra: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  status: string | null;
  order_id: number | null;
  gst_amount: number | null;
  commission_amount: number | null;
  tds_amount: number | null;
  created_at: string;
  formatted_order_id?: string | null;
  /** Payment gateway transaction ID — show in ledger for bank reference. */
  pg_transaction_id?: string | null;
}

export interface PayoutQuote {
  requested_amount: number;
  commission_percentage: number;
  commission_amount: number;
  net_payout_amount: number;
}

export interface PayoutResult {
  payout_request_id: number;
  amount: number;
  commission_percentage: number;
  commission_amount: number;
  net_payout_amount: number;
  status: string;
  hold_ledger_id?: number | null;
}

export const WALLET_CONSTANTS = {
  MIN_WITHDRAWAL_AMOUNT: 100,
  MAX_PENDING_WITHDRAWALS: 3,
  DEFAULT_REFUND_WINDOW_DAYS: 3,
  MAX_LEDGER_PAGE_SIZE: 100,
  DEFAULT_LEDGER_PAGE_SIZE: 50,
  WITHDRAWAL_COMPLETED_DESCRIPTION:
    'Funds have been successfully transferred to the registered bank account.',
} as const;

/** Dashboard freeze → Partner Site Withdraw disable (Supabase broadcast). */
export const MERCHANT_WALLET_FREEZE_EVENT = "wallet_freeze" as const;
export function merchantWalletFreezeChannel(storeId: number | string): string {
  return `merchant_wallet_freeze:${storeId}`;
}

/** Normalize legacy withdrawal-complete ledger copy for merchant-facing UI. */
export function formatLedgerDescription(description: string | null | undefined): string {
  if (!description?.trim()) return '';
  const trimmed = description.trim();
  if (/^Withdrawal completed #\d+$/i.test(trimmed)) {
    return WALLET_CONSTANTS.WITHDRAWAL_COMPLETED_DESCRIPTION;
  }
  if (/withdrawal|funds returned|release hold|hold released|payout/i.test(trimmed)) {
    return trimmed
      .replace(/\s*#\d+\b/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }
  return trimmed;
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Canonical withdrawable: available minus active payouts not already in hold. */
export function computeMerchantWithdrawalBuckets(input: {
  available_balance: number;
  hold_balance?: number;
  pending_withdrawal_total?: number;
  in_process_withdrawal_total?: number;
}): {
  withdrawable_balance: number;
  pending_withdrawal_total: number;
  in_process_withdrawal_total: number;
  active_payout_total: number;
} {
  const available = roundMoney(Math.max(0, Number(input.available_balance) || 0));
  const hold = roundMoney(Math.max(0, Number(input.hold_balance) || 0));
  const pendingWithdrawal = roundMoney(Math.max(0, Number(input.pending_withdrawal_total) || 0));
  const inProcess = roundMoney(Math.max(0, Number(input.in_process_withdrawal_total) || 0));
  const activePayouts = roundMoney(pendingWithdrawal + inProcess);
  const uncovered = roundMoney(Math.max(0, activePayouts - hold));
  return {
    withdrawable_balance: roundMoney(Math.max(0, available - uncovered)),
    pending_withdrawal_total: pendingWithdrawal,
    in_process_withdrawal_total: inProcess,
    active_payout_total: activePayouts,
  };
}

export function calculateMerchantWithdrawalAccounting(input: {
  available_balance: number;
  hold_balance?: number;
  pending_balance?: number;
  pending_withdrawal_total?: number;
  in_process_withdrawal_total?: number;
  paid_amount?: number;
  failed_amount?: number;
  is_frozen?: boolean;
  settlement_paused?: boolean;
}) {
  const available = roundMoney(Math.max(0, Number(input.available_balance) || 0));
  const hold = roundMoney(Math.max(0, Number(input.hold_balance) || 0));
  const pending = roundMoney(Math.max(0, Number(input.pending_balance) || 0));
  const buckets = computeMerchantWithdrawalBuckets({
    available_balance: available,
    hold_balance: hold,
    pending_withdrawal_total: input.pending_withdrawal_total,
    in_process_withdrawal_total: input.in_process_withdrawal_total,
  });
  const isFrozen = input.is_frozen === true;
  return {
    available_balance: available,
    held_balance: hold,
    pending_balance: pending,
    pending_withdrawal: buckets.pending_withdrawal_total,
    processing_withdrawal: buckets.in_process_withdrawal_total,
    withdrawable_balance: buckets.withdrawable_balance,
    paid_amount: roundMoney(Math.max(0, Number(input.paid_amount) || 0)),
    failed_amount: roundMoney(Math.max(0, Number(input.failed_amount) || 0)),
    is_frozen: isFrozen,
    withdrawal_allowed: !isFrozen && input.settlement_paused !== true,
  };
}
