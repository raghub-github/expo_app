/**
 * Admin Merchant Debit / CTM wallet actions (+ ledger inspectors).
 * Pure math lives in merchant-ctm-debit-math.ts — keep backends in sync.
 */
import { getSql } from "@/lib/db/client";

export {
  adminCancellationLedgerMetadata,
  adminDebitToCompensationPct,
  COMPENSATION_CREDIT_REASON,
  COMPENSATION_RECOVERY_REASON,
  isNoDebitMerchantMode,
  merchantCtmAdjustmentIdempotencyKey,
  merchantDebitKeepPct,
  normalizeMerchantDebitMode,
  resolveAdminCancellationWalletAction,
  resolveCancellationPayoutScenario,
  resolveMerchantCtmDebitAdjustment,
  roundMoney2,
  type CancellationPayoutScenario,
  type CancellationWalletAction,
  type MerchantCtmDebitAdjustment,
  type MerchantDebitMode,
} from "@/lib/merchant-ctm-debit-math";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * True when merchant ORDER_EARNING (settlement) exists for this order.
 * Does NOT include compensation credits — use inspectOrderCtmLedgerState for full CTM net.
 */
export async function orderHasPayoutCredited(
  walletId: number,
  ordersFoodId: number,
  orderCoreId: number
): Promise<boolean> {
  const sql = getSql();
  const rows = await sql.unsafe<{ found: boolean }[]>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM merchant_wallet_ledger
        WHERE wallet_id = $1
          AND reference_type = 'ORDER'::wallet_reference_type
          AND (
            reference_id = $2
            OR idempotency_key = $3
            OR idempotency_key = $4
            OR (metadata->>'orders_core_id')::bigint = $5
          )
          AND direction = 'CREDIT'
          AND category = 'ORDER_EARNING'::wallet_transaction_category
          AND UPPER(COALESCE(status, 'COMPLETED')) NOT IN ('FAILED', 'CANCELLED', 'REJECTED', 'PENDING')
      ) AS found
    `,
    [
      walletId,
      ordersFoodId,
      `order_earning_${ordersFoodId}`,
      `settle:order:${orderCoreId}`,
      orderCoreId,
    ]
  );
  return Boolean(rows[0]?.found);
}

export type OrderCtmLedgerState = {
  grossCredited: number;
  reversed: number;
  netHeld: number;
  earningCredited: number;
  compensationCredited: number;
};

/**
 * Authoritative CTM ledger state for one order — never inferred from wallet balance.
 */
export async function inspectOrderCtmLedgerState(
  walletId: number,
  ordersFoodId: number,
  orderCoreId: number
): Promise<OrderCtmLedgerState> {
  const sql = getSql();
  const rows = await sql.unsafe<
    {
      earning_credited: string | number;
      compensation_credited: string | number;
      reversed: string | number;
    }[]
  >(
    `
      SELECT
        COALESCE(SUM(
          CASE
            WHEN direction = 'CREDIT'
              AND category = 'ORDER_EARNING'::wallet_transaction_category
            THEN amount ELSE 0
          END
        ), 0) AS earning_credited,
        COALESCE(SUM(
          CASE
            WHEN direction = 'CREDIT'
              AND category = 'ORDER_ADJUSTMENT'::wallet_transaction_category
              AND (
                idempotency_key = $3
                OR idempotency_key LIKE $4
                OR (
                  (metadata->>'entry_type') = 'order_cancellation'
                  AND LOWER(COALESCE(metadata->>'balance_impact', '')) = 'credit'
                )
              )
            THEN amount ELSE 0
          END
        ), 0) AS compensation_credited,
        COALESCE(SUM(
          CASE
            WHEN direction = 'DEBIT'
              AND category = 'ORDER_ADJUSTMENT'::wallet_transaction_category
              AND (
                idempotency_key LIKE $5
                OR idempotency_key LIKE $6
                OR (
                  (metadata->>'entry_type') = 'order_cancellation'
                  AND LOWER(COALESCE(metadata->>'balance_impact', '')) = 'debit'
                )
              )
            THEN amount ELSE 0
          END
        ), 0) AS reversed
      FROM merchant_wallet_ledger
      WHERE wallet_id = $1
        AND reference_type = 'ORDER'::wallet_reference_type
        AND (
          reference_id = $2
          OR idempotency_key = $3
          OR idempotency_key = $7
          OR idempotency_key LIKE $4
          OR idempotency_key LIKE $5
          OR idempotency_key LIKE $6
          OR (metadata->>'orders_core_id')::bigint = $8
        )
        AND UPPER(COALESCE(status, 'COMPLETED')) NOT IN ('FAILED', 'CANCELLED', 'REJECTED', 'PENDING')
    `,
    [
      walletId,
      ordersFoodId,
      `merchant_cancel_comp_credit:${orderCoreId}`,
      `merchant_ctm_adj:${orderCoreId}:credit:%`,
      `merchant_cancel_debit:${orderCoreId}:%`,
      `merchant_ctm_adj:${orderCoreId}:debit:%`,
      `settle:order:${orderCoreId}`,
      orderCoreId,
    ]
  );

  const earningCredited = round2(Number(rows[0]?.earning_credited) || 0);
  const compensationCredited = round2(Number(rows[0]?.compensation_credited) || 0);
  const reversed = round2(Number(rows[0]?.reversed) || 0);
  const grossCredited = round2(earningCredited + compensationCredited);
  const netHeld = round2(Math.max(0, grossCredited - reversed));

  return {
    grossCredited,
    reversed,
    netHeld,
    earningCredited,
    compensationCredited,
  };
}
