import { getSql } from "../db/client.js";

export type PayoutPartyType = "MERCHANT" | "RIDER";

export type PayoutAmountLimits = {
  minAmount: number;
  maxAmount: number;
};

const DEFAULTS: Record<PayoutPartyType, PayoutAmountLimits> = {
  MERCHANT: { minAmount: 100, maxAmount: 100_000 },
  RIDER: { minAmount: 100, maxAmount: 100_000 },
};

/** Read active min/max withdrawal limits from payment_payout_rules (0239+). */
export async function readPayoutAmountLimits(
  partyType: PayoutPartyType
): Promise<PayoutAmountLimits> {
  const fallback = DEFAULTS[partyType];
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT min_payout_amount, max_payout_amount
      FROM payment_payout_rules
      WHERE is_active
        AND party_type = ${partyType}
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR effective_to > NOW())
      ORDER BY id DESC
      LIMIT 1
    `;
    if (rows.length === 0) return { ...fallback };
    const row = rows[0] as { min_payout_amount?: unknown; max_payout_amount?: unknown };
    const min = Number(row.min_payout_amount);
    const max = Number(row.max_payout_amount);
    return {
      minAmount: Number.isFinite(min) && min > 0 ? min : fallback.minAmount,
      maxAmount: Number.isFinite(max) && max > 0 ? max : fallback.maxAmount,
    };
  } catch {
    return { ...fallback };
  }
}
