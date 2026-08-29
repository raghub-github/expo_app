import type { WalletSummary } from "@gatimitra/contracts";
import { roundMoney, computeMerchantWithdrawalBuckets, WALLET_CONSTANTS } from "@gatimitra/contracts";
import type { Sql } from "postgres";

async function readMerchantPayoutAmountLimits(sql: Sql): Promise<{
  minAmount: number;
  maxAmount: number;
}> {
  const fallback = {
    minAmount: WALLET_CONSTANTS.MIN_WITHDRAWAL_AMOUNT,
    maxAmount: WALLET_CONSTANTS.MAX_WITHDRAWAL_AMOUNT ?? 100_000,
  };
  try {
    const rows = await sql`
      SELECT min_payout_amount, max_payout_amount
      FROM payment_payout_rules
      WHERE is_active
        AND party_type = 'MERCHANT'
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR effective_to > NOW())
      ORDER BY id DESC
      LIMIT 1
    `;
    if (rows.length === 0) return fallback;
    const row = rows[0] as { min_payout_amount?: unknown; max_payout_amount?: unknown };
    const min = Number(row.min_payout_amount);
    const max = Number(row.max_payout_amount);
    return {
      minAmount: Number.isFinite(min) && min > 0 ? min : fallback.minAmount,
      maxAmount: Number.isFinite(max) && max > 0 ? max : fallback.maxAmount,
    };
  } catch {
    return fallback;
  }
}

/** Adds payment-engine fields so all portals show the same balance breakdown. */
export async function enrichWalletSummary(
  sql: Sql,
  walletId: number,
  summary: WalletSummary
): Promise<WalletSummary> {
  let settlementPaused = false;

  try {
    const [w] = await sql`
      SELECT COALESCE(settlement_paused, false) AS settlement_paused
      FROM merchant_wallet WHERE id = ${walletId}
    `;
    settlementPaused = Boolean((w as { settlement_paused?: boolean } | undefined)?.settlement_paused);
  } catch {
    /* column may not exist pre-0239 */
  }

  const available = summary.available_balance;
  const hold = summary.hold_balance;
  const pending = summary.pending_balance;
  const buckets = computeMerchantWithdrawalBuckets({
    available_balance: available,
    hold_balance: hold,
    pending_withdrawal_total: summary.pending_withdrawal_total,
    in_process_withdrawal_total: summary.in_process_withdrawal_total ?? 0,
  });

  const limits = await readMerchantPayoutAmountLimits(sql);

  return {
    ...summary,
    locked_balance: 0,
    locked_settlement_total: 0,
    pending_withdrawal_total: buckets.pending_withdrawal_total,
    in_process_withdrawal_total: buckets.in_process_withdrawal_total,
    withdrawable_balance: buckets.withdrawable_balance,
    total_balance: roundMoney(available + hold + pending),
    settlement_paused: settlementPaused,
    min_withdrawal_amount: limits.minAmount,
    max_withdrawal_amount: limits.maxAmount,
  };
}
