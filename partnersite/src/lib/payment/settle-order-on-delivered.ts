import type postgres from 'postgres';

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
  ledgerId?: number;
  error?: string;
};

export async function settleMerchantOrderOnDelivered(
  sql: postgres.Sql,
  input: SettleOrderOnDeliveredInput
): Promise<SettleOrderResult> {
  const next = String(input.newStatus ?? '').toUpperCase();
  const prev = String(input.previousStatus ?? '').toUpperCase();
  if (next !== 'DELIVERED' || prev === 'DELIVERED') return { credited: false };

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
        ${Number(input.packaging ?? 0)}::numeric,
        ${Number(input.surge ?? 0)}::numeric,
        ${Number(input.tips ?? 0)}::numeric,
        NULL::bigint,
        ${idempotencyKey}::text
      )::jsonb AS result
    `;
    const result = (rows[0] as { result?: { ok?: boolean; duplicate?: boolean; ledger_id?: number } })?.result;
    if (result?.ok || result?.duplicate) {
      return { credited: true, ledgerId: Number(result.ledger_id) || undefined };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('payment_process_delivered_settlement') && !msg.includes('does not exist')) {
      console.warn('[settleMerchantOrderOnDelivered]', msg);
    }
  }

  try {
    const walletRows = await sql`
      SELECT get_or_create_merchant_wallet(${input.merchantStoreId}) AS wallet_id
    `;
    const walletId = Number((walletRows[0] as { wallet_id?: number })?.wallet_id);
    const ledgerRows = await sql`
      SELECT merchant_wallet_credit(
        ${walletId}, ${gross}, ${'ORDER_EARNING'}, ${'LOCKED'}, ${'ORDER'},
        ${input.ordersFoodId}, ${`order_earning_${input.ordersFoodId}`},
        ${`Order #${input.ordersCoreId} delivered`},
        ${JSON.stringify({ orders_core_id: input.ordersCoreId })}::jsonb
      ) AS ledger_id
    `;
    return { credited: true, ledgerId: Number((ledgerRows[0] as { ledger_id?: number })?.ledger_id) };
  } catch (e) {
    return { credited: false, error: e instanceof Error ? e.message : String(e) };
  }
}
