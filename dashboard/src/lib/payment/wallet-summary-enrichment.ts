import type { WalletSummary } from "@gatimitra/contracts";
import { roundMoney } from "@gatimitra/contracts";
import type { Sql } from "postgres";

/** Adds payment-engine fields so all portals show the same balance breakdown. */
export async function enrichWalletSummary(
  sql: Sql,
  walletId: number,
  summary: WalletSummary
): Promise<WalletSummary> {
  let settlementPaused = false;
  let lockedSettlementTotal = 0;

  try {
    const [w] = await sql`
      SELECT COALESCE(settlement_paused, false) AS settlement_paused
      FROM merchant_wallet WHERE id = ${walletId}
    `;
    settlementPaused = Boolean((w as { settlement_paused?: boolean } | undefined)?.settlement_paused);
  } catch {
    /* column may not exist pre-0239 */
  }

  try {
    const lockedRows = await sql`
      SELECT COALESCE(SUM(merchant_net), 0) AS total
      FROM payment_order_settlements
      WHERE wallet_id = ${walletId}
        AND lifecycle_status IN ('LOCKED', 'HOLD')
    `;
    lockedSettlementTotal = Number((lockedRows[0] as { total?: number } | undefined)?.total ?? 0);
  } catch {
    lockedSettlementTotal = summary.locked_balance;
  }

  const available = summary.available_balance;
  const locked = summary.locked_balance;
  const hold = summary.hold_balance;
  const pending = summary.pending_balance;

  return {
    ...summary,
    locked_settlement_total: roundMoney(lockedSettlementTotal),
    withdrawable_balance: roundMoney(available),
    total_balance: roundMoney(available + locked + hold + pending),
    settlement_paused: settlementPaused,
  };
}
