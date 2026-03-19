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
} as const;

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
