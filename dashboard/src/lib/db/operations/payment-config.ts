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
  const safe = async (q: () => ReturnType<typeof sql>) => {
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

export async function listPendingMerchantPayouts(limit = 50) {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT pr.*, w.merchant_store_id, ms.store_id AS store_code, ms.store_name
      FROM merchant_payout_requests pr
      JOIN merchant_wallet w ON w.id = pr.wallet_id
      JOIN merchant_stores ms ON ms.id = w.merchant_store_id
      WHERE pr.status = 'PENDING'
      ORDER BY pr.requested_at ASC
      LIMIT ${limit}
    `;
    return rows as Record<string, unknown>[];
  } catch {
    return [];
  }
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
