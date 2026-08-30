/**
 * Merchant-funded waiting debit (Step 2) — when a food service_payout_rule sets
 * waiting_funding_mode = MERCHANT_100, the rider is still paid the waiting charge but the
 * STORE bears it: its wallet is debited by the merchant share. Reuses the existing
 * idempotent merchant_wallet_debit DB primitive (same one the cancellation clawback uses)
 * — no parallel wallet path.
 *
 * Best-effort + non-blocking: the obligation is always persisted in billing_snapshot
 * (merchant_funded_waiting) by the caller, so if the immediate debit can't apply (merchant
 * has no available balance yet, wallet not migrated) the amount is still recorded for
 * settlement-time netting and the pickup flow is never blocked. Idempotent per order.
 */
import type { Sql } from "postgres";
import { getSql } from "../db/client.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type MerchantFundedWaitingDebitResult = {
  debited: boolean;
  amount: number;
  ledgerId?: number;
  skipped?: string;
};

export async function applyMerchantFundedWaitingDebit(
  args: {
    orderCoreId: number;
    ordersFoodId: number;
    merchantStoreId: number;
    amount: number;
  },
  sqlArg?: Sql
): Promise<MerchantFundedWaitingDebitResult> {
  const amount = round2(args.amount);
  if (!(amount > 0)) return { debited: false, amount: 0, skipped: "zero_amount" };
  if (!Number.isFinite(args.merchantStoreId) || args.merchantStoreId <= 0) {
    return { debited: false, amount, skipped: "no_store" };
  }
  if (!Number.isFinite(args.ordersFoodId) || args.ordersFoodId <= 0) {
    return { debited: false, amount, skipped: "no_food_order" };
  }

  const sql = sqlArg ?? getSql();
  try {
    const walletRows = await sql<{ wallet_id: number | string }[]>`
      SELECT get_or_create_merchant_wallet(${args.merchantStoreId}::bigint) AS wallet_id
    `;
    const walletId = Number(walletRows[0]?.wallet_id);
    if (!Number.isFinite(walletId) || walletId <= 0) {
      return { debited: false, amount, skipped: "wallet_not_found" };
    }

    // Idempotent per order via idempotency_key — a retried pickup never double-debits.
    const idempotencyKey = `waiting_merchant_debit:${args.orderCoreId}`;
    const rows = await sql<{ ledger_id: number | null }[]>`
      SELECT merchant_wallet_debit(
        ${walletId}::bigint,
        ${amount}::numeric,
        'ORDER_ADJUSTMENT'::wallet_transaction_category,
        'AVAILABLE'::wallet_balance_type,
        'ORDER'::wallet_reference_type,
        ${args.ordersFoodId}::bigint,
        ${idempotencyKey}::text,
        ${"Rider waiting — kitchen prep delay"}::text,
        ${JSON.stringify({
          orders_core_id: args.orderCoreId,
          entry_type: "rider_waiting",
          balance_impact: "debit",
          waiting_funding_mode: "MERCHANT_100",
          waiting_amount: amount,
        })}::text::jsonb
      ) AS ledger_id
    `;
    const ledgerId = Number(rows[0]?.ledger_id);
    if (Number.isFinite(ledgerId) && ledgerId > 0) {
      return { debited: true, amount, ledgerId };
    }
    return { debited: false, amount, skipped: "debit_no_row" };
  } catch (e) {
    // Insufficient balance / wallet not migrated → obligation stays recorded in
    // billing_snapshot for settlement netting; never fail the pickup.
    const msg = e instanceof Error ? e.message : String(e);
    const skipped = /insufficient/i.test(msg)
      ? "insufficient_balance"
      : /does not exist/i.test(msg)
        ? "wallet_not_migrated"
        : "debit_error";
    if (skipped === "debit_error") {
      console.warn("[applyMerchantFundedWaitingDebit]", args.orderCoreId, msg);
    }
    return { debited: false, amount, skipped };
  }
}
