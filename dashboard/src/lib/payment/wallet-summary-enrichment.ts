import type { WalletSummary } from "@gatimitra/contracts";
import { roundMoney, computeMerchantWithdrawalBuckets } from "@gatimitra/contracts";
import type { Sql } from "postgres";

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

  return {
    ...summary,
    locked_balance: 0,
    locked_settlement_total: 0,
    pending_withdrawal_total: buckets.pending_withdrawal_total,
    in_process_withdrawal_total: buckets.in_process_withdrawal_total,
    withdrawable_balance: buckets.withdrawable_balance,
    total_balance: roundMoney(available + hold + pending),
    settlement_paused: settlementPaused,
  };
}
