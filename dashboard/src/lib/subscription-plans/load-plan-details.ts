import { getSql } from "@/lib/db/client";

export async function loadPlanDetails(planId: number) {
  const sql = getSql();
  const [plan] = await sql`SELECT * FROM subscription_plans WHERE id = ${planId}`;
  if (!plan) return null;

  const prices = await sql`
    SELECT * FROM subscription_plan_prices WHERE plan_id = ${planId} ORDER BY billing_cycle
  `;
  const benefits = await sql`
    SELECT * FROM subscription_plan_benefits WHERE plan_id = ${planId} ORDER BY display_order ASC, id ASC
  `;

  const seenBenefitLabels = new Set<string>();
  const mappedBenefits = (benefits as Record<string, unknown>[])
    .map((r) => ({
      id: Number(r.id),
      benefitKey: String(r.benefit_key ?? ""),
      benefitValue: String(r.benefit_value ?? ""),
      displayLabel: r.display_label != null ? String(r.display_label) : null,
      displayOrder: Number(r.display_order ?? 0),
    }))
    .filter((b) => {
      const label = (b.displayLabel || b.benefitKey).trim().toLowerCase();
      if (!label || seenBenefitLabels.has(label)) return false;
      seenBenefitLabels.add(label);
      return true;
    });

  const p = plan as Record<string, unknown>;
  return {
    id: Number(p.id),
    code: String(p.code ?? ""),
    name: String(p.name ?? ""),
    description: p.description != null ? String(p.description) : null,
    badgeText: p.badge_text != null ? String(p.badge_text) : null,
    badgeColor: p.badge_color != null ? String(p.badge_color) : "#7C3AED",
    headline: p.headline != null ? String(p.headline) : null,
    ctaLabel: p.cta_label != null ? String(p.cta_label) : "Subscribe now",
    isActive: Boolean(p.is_active),
    displayOrder: Number(p.display_order ?? 0),
    defaultBillingCycle: p.default_billing_cycle != null ? String(p.default_billing_cycle) : "monthly",
    prices: (prices as Record<string, unknown>[]).map((r) => {
      const subtotal = Number(r.amount ?? 0);
      const gstPercent = r.gst_percent != null ? Number(r.gst_percent) : 18;
      const gstAmount = Math.round((subtotal * gstPercent) / 100 * 100) / 100;
      const total = Math.round((subtotal + gstAmount) * 100) / 100;
      return {
        id: Number(r.id),
        billingCycle: String(r.billing_cycle ?? ""),
        amount: subtotal,
        gstPercent,
        gstAmount,
        totalAmount: total,
        autoWalletDeduction: Boolean(r.auto_wallet_deduction),
        isActive: Boolean(r.is_active),
      };
    }),
    benefits: mappedBenefits,
    createdAt: p.created_at != null ? String(p.created_at) : null,
  };
}
