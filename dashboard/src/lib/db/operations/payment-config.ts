import { getSql } from "../client";

export type PaymentConfigBundle = {
  globalSettings: Record<string, unknown>[];
  settlementRules: Record<string, unknown>[];
  cancellationRules: Record<string, unknown>[];
  holdRules: Record<string, unknown>[];
  payoutRules: Record<string, unknown>[];
  commissionRules: Record<string, unknown>[];
  taxRules: Record<string, unknown>[];
  refundRules: Record<string, unknown>[];
  gatewaySettings: Record<string, unknown>[];
};

export async function getPaymentConfigBundle(): Promise<PaymentConfigBundle> {
  const sql = getSql();
  const safe = async (q: () => unknown) => {
    try {
      return (await q()) as unknown as Record<string, unknown>[];
    } catch {
      return [];
    }
  };

  return {
    globalSettings: await safe(() => sql`
      SELECT * FROM payment_global_settings WHERE is_active ORDER BY setting_key, version DESC
    `),
    settlementRules: await safe(() => sql`SELECT * FROM payment_settlement_rules ORDER BY priority, id`),
    cancellationRules: await safe(() => sql`SELECT * FROM payment_cancellation_rules ORDER BY priority, id`),
    holdRules: [],
    payoutRules: await safe(() => sql`SELECT * FROM payment_payout_rules ORDER BY id`),
    commissionRules: await safe(() => sql`SELECT * FROM payment_commission_rules ORDER BY id`),
    taxRules: await safe(() => sql`SELECT * FROM payment_tax_rules ORDER BY id`),
    refundRules: await safe(() => sql`SELECT * FROM payment_refund_rules ORDER BY id`),
    gatewaySettings: await safe(() => sql`SELECT id, provider, display_name, is_active, is_default, config FROM payment_gateway_settings ORDER BY provider`),
  };
}

export async function listMerchantPayouts(limit = 200) {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT
        pr.id,
        pr.wallet_id,
        pr.amount,
        pr.net_payout_amount,
        pr.commission_percentage,
        pr.commission_amount,
        pr.status,
        pr.pg_transaction_id,
        pr.utr_reference,
        pr.rejection_reason,
        pr.requested_at,
        pr.approved_at,
        pr.completed_at,
        pr.bank_account_id,
        w.merchant_store_id,
        ms.store_id AS store_code,
        ms.store_name
      FROM merchant_payout_requests pr
      JOIN merchant_wallet w ON w.id = pr.wallet_id
      JOIN merchant_stores ms ON ms.id = w.merchant_store_id
      ORDER BY pr.requested_at DESC
      LIMIT ${limit}
    `;
    return rows as Record<string, unknown>[];
  } catch {
    return [];
  }
}

export async function updateMerchantPayoutPgOrUtr(
  payoutId: number,
  field: "pg" | "utr",
  value: string
) {
  const sql = getSql();
  const trimmed = value.trim();
  if (field === "pg") {
    if (!trimmed) throw new Error("PG transaction ID is required");
    await sql`
      UPDATE merchant_payout_requests
      SET pg_transaction_id = ${trimmed}, updated_at = NOW()
      WHERE id = ${payoutId}
    `;
    try {
      await sql`
        UPDATE payment_payout_approvals
        SET gateway_payout_id = ${trimmed}, updated_at = NOW()
        WHERE payout_request_id = ${payoutId} AND payout_type = 'MERCHANT'
      `;
    } catch {
      /* pre-0239 */
    }
    return { ok: true, field: "pg" };
  }
  await sql`
    UPDATE merchant_payout_requests
    SET utr_reference = ${trimmed || null}, updated_at = NOW()
    WHERE id = ${payoutId}
  `;
  try {
    await sql`
      UPDATE payment_payout_approvals
      SET utr_reference = ${trimmed || null}, updated_at = NOW()
      WHERE payout_request_id = ${payoutId} AND payout_type = 'MERCHANT'
    `;
  } catch {
    /* pre-0239 */
  }
  return { ok: true, field: "utr" };
}

/** @deprecated use listMerchantPayouts */
export async function listPendingMerchantPayouts(limit = 50) {
  return listMerchantPayouts(limit);
}

export async function completeMerchantPayoutWithPgTxn(
  payoutId: number,
  pgTransactionId: string,
  systemUserId: number,
  utrReference?: string | null
) {
  const sql = getSql();
  const pg = pgTransactionId.trim();
  if (!pg) throw new Error("PG transaction ID is required");
  const [row] = await sql`
    SELECT payment_complete_merchant_payout(
      ${payoutId}::bigint,
      ${pg},
      ${systemUserId}::bigint,
      ${utrReference?.trim() || null}
    )::jsonb AS result
  `;
  return (row as { result?: Record<string, unknown> })?.result;
}

export async function approvePayoutRpc(payoutId: number, systemUserId: number) {
  const sql = getSql();
  const [row] = await sql`
    SELECT payment_approve_merchant_payout(${payoutId}::bigint, ${systemUserId}::bigint, NULL::text)::jsonb AS result
  `;
  return (row as { result?: Record<string, unknown> })?.result;
}

export async function rejectPayoutRpc(payoutId: number, systemUserId: number, reason: string) {
  const sql = getSql();
  const [row] = await sql`
    SELECT payment_reject_merchant_payout(${payoutId}::bigint, ${systemUserId}::bigint, ${reason})::jsonb AS result
  `;
  return (row as { result?: Record<string, unknown> })?.result;
}
