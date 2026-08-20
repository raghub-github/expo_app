import type { Sql } from "postgres";
import { getSql } from "../db/client.js";

export type SettleOrderOnDeliveredInput = {
  merchantStoreId: number;
  ordersFoodId: number;
  ordersCoreId: number;
  /** OSB merchant_gross. v2 is already discounted CTM — do not × commission factor again. */
  merchantGross: number;
  newStatus: string;
  previousStatus: string;
};

/** Stable per-order key. Webhook / placement / DELIVERED retries must reuse this. */
export function merchantDeliveredSettlementIdempotencyKey(ordersCoreId: number): string {
  return `settle:order:${ordersCoreId}`;
}

/** Wallet credit only on the first transition into DELIVERED. */
export function shouldCreditMerchantOnDelivered(
  newStatus: string,
  previousStatus: string
): boolean {
  const next = String(newStatus ?? "").toUpperCase();
  const prev = String(previousStatus ?? "").toUpperCase();
  return next === "DELIVERED" && prev !== "DELIVERED";
}

export async function settleMerchantOrderOnDelivered(
  input: SettleOrderOnDeliveredInput
): Promise<{ credited: boolean; error?: string }> {
  const sql = getSql();
  if (!shouldCreditMerchantOnDelivered(input.newStatus, input.previousStatus)) {
    return { credited: false };
  }

  const gross = Number(input.merchantGross);
  if (!Number.isFinite(gross) || gross <= 0) return { credited: false };

  // Pass OSB merchant_gross as-is. v2 rows are discounted CTM rupees (not customer catalog).
  // payment_process_delivered_settlement may record payment_commission_rules as payout_meta;
  // that mechanism fee stays informational by default and must not re-scale v2 CTM.
  const idempotencyKey = merchantDeliveredSettlementIdempotencyKey(input.ordersCoreId);

  try {
    const rows = await sql`
      SELECT payment_process_delivered_settlement(
        ${input.ordersCoreId}::bigint,
        ${input.ordersFoodId}::bigint,
        ${input.merchantStoreId}::bigint,
        ${gross}::numeric,
        0::numeric, 0::numeric, 0::numeric,
        NULL::bigint,
        ${idempotencyKey}::text
      )::jsonb AS result
    `;
    const result = (rows[0] as { result?: { ok?: boolean; duplicate?: boolean } })?.result;
    if (result?.ok || result?.duplicate) return { credited: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("payment_process_delivered_settlement") && !msg.includes("does not exist")) {
      console.warn("[settleMerchantOrderOnDelivered]", msg);
    }
  }

  return legacyCredit(sql, input, gross);
}

async function legacyCredit(
  sql: Sql,
  input: SettleOrderOnDeliveredInput,
  amount: number
): Promise<{ credited: boolean; error?: string }> {
  try {
    const walletRows = await sql`
      SELECT get_or_create_merchant_wallet(${input.merchantStoreId}) AS wallet_id
    `;
    const walletId = Number((walletRows[0] as { wallet_id?: number })?.wallet_id);
    await sql`
      SELECT merchant_wallet_credit(
        ${walletId}, ${amount}, ${"ORDER_EARNING"}, ${"LOCKED"}, ${"ORDER"},
        ${input.ordersFoodId}, ${`order_earning_${input.ordersFoodId}`},
        ${`Order #${input.ordersCoreId} delivered`},
        ${JSON.stringify({ orders_core_id: input.ordersCoreId })}::jsonb
      )
    `;
    return { credited: true };
  } catch (e) {
    return { credited: false, error: e instanceof Error ? e.message : String(e) };
  }
}
