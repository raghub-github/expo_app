import type { Sql } from "postgres";
import { getSql } from "../db/client.js";

export type SettleOrderOnDeliveredInput = {
  merchantStoreId: number;
  ordersFoodId: number;
  ordersCoreId: number;
  merchantGross: number;
  newStatus: string;
  previousStatus: string;
};

export async function settleMerchantOrderOnDelivered(
  input: SettleOrderOnDeliveredInput
): Promise<{ credited: boolean; error?: string }> {
  const sql = getSql();
  const next = String(input.newStatus ?? "").toUpperCase();
  const prev = String(input.previousStatus ?? "").toUpperCase();
  if (next !== "DELIVERED" || prev === "DELIVERED") return { credited: false };

  const gross = Number(input.merchantGross);
  if (!Number.isFinite(gross) || gross <= 0) return { credited: false };

  const idempotencyKey = `settle:order:${input.ordersCoreId}`;

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
