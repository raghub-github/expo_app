import type { Sql } from "postgres";

export type SettleOrderOnDeliveredInput = {
  merchantStoreId: number;
  ordersFoodId: number;
  ordersCoreId: number;
  merchantGross: number;
  packaging?: number;
  surge?: number;
  tips?: number;
  newStatus: string;
  previousStatus: string;
};

export type SettleOrderResult = {
  credited: boolean;
  settlementId?: number;
  ledgerId?: number;
  merchantNet?: number;
  usedPaymentEngine?: boolean;
  error?: string;
};

/** Uses payment_process_delivered_settlement when 0239 is applied; falls back to legacy credit. */
export async function settleMerchantOrderOnDelivered(
  sql: Sql,
  input: SettleOrderOnDeliveredInput
): Promise<SettleOrderResult> {
  const next = String(input.newStatus ?? "").toUpperCase();
  const prev = String(input.previousStatus ?? "").toUpperCase();
  if (next !== "DELIVERED" || prev === "DELIVERED") {
    return { credited: false };
  }

  const gross = Number(input.merchantGross);
  if (!Number.isFinite(gross) || gross <= 0) {
    return { credited: false };
  }

  const idempotencyKey = `settle:order:${input.ordersCoreId}`;

  try {
    const rows = await sql`
      SELECT payment_process_delivered_settlement(
        ${input.ordersCoreId}::bigint,
        ${input.ordersFoodId}::bigint,
        ${input.merchantStoreId}::bigint,
        ${gross}::numeric,
        ${Number(input.packaging ?? 0)}::numeric,
        ${Number(input.surge ?? 0)}::numeric,
        ${Number(input.tips ?? 0)}::numeric,
        NULL::bigint,
        ${idempotencyKey}::text
      )::jsonb AS result
    `;
    const result = (rows[0] as { result?: Record<string, unknown> } | undefined)?.result;
    if (result && result.ok === true) {
      return {
        credited: true,
        usedPaymentEngine: true,
        settlementId: Number(result.settlement_id) || undefined,
        ledgerId: Number(result.ledger_id) || undefined,
        merchantNet: Number(result.merchant_net) || undefined,
      };
    }
    if (result?.duplicate === true) {
      return { credited: true, usedPaymentEngine: true };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("payment_process_delivered_settlement") && !msg.includes("does not exist")) {
      console.warn("[settleMerchantOrderOnDelivered] payment engine:", msg);
    }
  }

  return legacyCreditOnDelivered(sql, input, gross);
}

async function legacyCreditOnDelivered(
  sql: Sql,
  input: SettleOrderOnDeliveredInput,
  amount: number
): Promise<SettleOrderResult> {
  try {
    const walletRows = await sql`
      SELECT get_or_create_merchant_wallet(${input.merchantStoreId}) AS wallet_id
    `;
    const walletId = Number(
      (walletRows[0] as { wallet_id?: number | string } | undefined)?.wallet_id
    );
    if (!Number.isFinite(walletId) || walletId <= 0) {
      return { credited: false, error: "wallet_not_found" };
    }

    const ledgerRows = await sql`
      SELECT merchant_wallet_credit(
        ${walletId},
        ${amount},
        ${"ORDER_EARNING"},
        ${"LOCKED"},
        ${"ORDER"},
        ${input.ordersFoodId},
        ${`order_earning_${input.ordersFoodId}`},
        ${`Order #${input.ordersCoreId} delivered`},
        ${JSON.stringify({ orders_core_id: input.ordersCoreId })}::jsonb
      ) AS ledger_id
    `;
    const ledgerId = Number((ledgerRows[0] as { ledger_id?: number } | undefined)?.ledger_id);
    return { credited: true, ledgerId: ledgerId || undefined, usedPaymentEngine: false };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[settleMerchantOrderOnDelivered] legacy:", e);
    return { credited: false, error: msg };
  }
}
