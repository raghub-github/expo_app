import type { PayoutQuote } from "@gatimitra/contracts";
import { roundMoney } from "@gatimitra/contracts";
import type { Sql } from "postgres";

/** Payout quote from payment_payout_rules + payment_commission_rules (fallback: platform_commission_rules). */
export async function getPaymentPayoutQuote(
  sql: Sql,
  storeId: number,
  amount: number
): Promise<PayoutQuote & { min_payout_amount: number; requires_admin_approval: boolean }> {
  const parentRows = await sql`SELECT parent_id FROM merchant_stores WHERE id = ${storeId} LIMIT 1`;
  const parentId = parentRows.length > 0 ? Number((parentRows[0] as { parent_id?: number }).parent_id) : null;
  const today = new Date().toISOString().slice(0, 10);

  let commissionPct = 0;
  let minPayout = 100;
  let requiresApproval = true;

  try {
    const payoutRule = await sql`
      SELECT min_payout_amount, requires_admin_approval,
             payout_commission_mode, payout_commission_value
      FROM payment_payout_rules
      WHERE is_active AND party_type = 'MERCHANT'
        AND effective_from <= NOW()
        AND (effective_to IS NULL OR effective_to > NOW())
      ORDER BY id DESC LIMIT 1
    `;
    if (payoutRule.length > 0) {
      const pr = payoutRule[0] as {
        min_payout_amount?: number;
        requires_admin_approval?: boolean;
        payout_commission_mode?: string;
        payout_commission_value?: number;
      };
      minPayout = Number(pr.min_payout_amount ?? 100);
      requiresApproval = Boolean(pr.requires_admin_approval ?? true);
      if (pr.payout_commission_mode === "PERCENTAGE" && pr.payout_commission_value != null) {
        commissionPct = Number(pr.payout_commission_value);
      }
    }
  } catch {
    /* pre-0239 */
  }

  if (commissionPct === 0) {
    try {
      const commRule = await sql`
        SELECT calculation_mode, commission_value FROM payment_commission_rules
        WHERE is_active
          AND (merchant_store_id = ${storeId} OR merchant_store_id IS NULL)
          AND effective_from <= NOW()
          AND (effective_to IS NULL OR effective_to > NOW())
        ORDER BY CASE WHEN merchant_store_id IS NOT NULL THEN 0 ELSE 1 END, id DESC
        LIMIT 1
      `;
      if (commRule.length > 0) {
        const c = commRule[0] as { calculation_mode?: string; commission_value?: number };
        if (c.calculation_mode === "PERCENTAGE") {
          commissionPct = Number(c.commission_value ?? 0);
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (commissionPct === 0) {
    const storeRule = await sql`
      SELECT commission_percentage FROM platform_commission_rules
      WHERE merchant_store_id = ${storeId} AND effective_from <= ${today}
        AND (effective_to IS NULL OR effective_to >= ${today})
      ORDER BY effective_from DESC LIMIT 1
    `;
    if (storeRule.length > 0) {
      commissionPct = Number((storeRule[0] as { commission_percentage?: number }).commission_percentage ?? 0);
    } else if (parentId) {
      const parentRule = await sql`
        SELECT commission_percentage FROM platform_commission_rules
        WHERE merchant_parent_id = ${parentId} AND effective_from <= ${today}
          AND (effective_to IS NULL OR effective_to >= ${today})
        ORDER BY effective_from DESC LIMIT 1
      `;
      if (parentRule.length > 0) {
        commissionPct = Number((parentRule[0] as { commission_percentage?: number }).commission_percentage ?? 0);
      }
    }
  }

  const commissionAmount = roundMoney((amount * commissionPct) / 100);
  const netPayoutAmount = roundMoney(amount - commissionAmount);

  return {
    requested_amount: amount,
    commission_percentage: commissionPct,
    commission_amount: commissionAmount,
    net_payout_amount: netPayoutAmount,
    min_payout_amount: minPayout,
    requires_admin_approval: requiresApproval,
  };
}
