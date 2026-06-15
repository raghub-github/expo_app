import { getSql } from "@/lib/db/client";

export type LoadedSubscriptionPlan = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  badgeText: string | null;
  badgeColor: string;
  headline: string | null;
  ctaLabel: string;
  isActive: boolean;
  displayOrder: number;
  defaultBillingCycle: string;
  planAudience: string;
  isFeatured: boolean;
  freeDeliveryEnabled: boolean;
  maxFreeDeliveryRadiusKm: number;
  discountPercentage: number | null;
  cashbackEnabled: boolean;
  cashbackPercentage: number | null;
  prioritySupport: boolean;
  prices: Array<{
    id: number;
    billingCycle: string;
    amount: number;
    gstPercent: number;
    gstAmount: number;
    totalAmount: number;
    autoWalletDeduction: boolean;
    isActive: boolean;
  }>;
  benefits: Array<{
    id: number;
    benefitKey: string;
    benefitValue: string;
    displayLabel: string | null;
    displayOrder: number;
  }>;
  createdAt: string | null;
  updatedAt: string | null;
};

function mapPlanRow(p: Record<string, unknown>): Omit<LoadedSubscriptionPlan, "prices" | "benefits"> {
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
    planAudience: p.plan_audience != null ? String(p.plan_audience) : "RIDER",
    isFeatured: p.is_featured === true,
    freeDeliveryEnabled: p.free_delivery_enabled === true,
    maxFreeDeliveryRadiusKm: p.max_free_delivery_radius_km != null ? Number(p.max_free_delivery_radius_km) : 7,
    discountPercentage: p.discount_percentage != null ? Number(p.discount_percentage) : null,
    cashbackEnabled: p.cashback_enabled === true,
    cashbackPercentage: p.cashback_percentage != null ? Number(p.cashback_percentage) : null,
    prioritySupport: p.priority_support === true,
    createdAt: p.created_at != null ? String(p.created_at) : null,
    updatedAt: p.updated_at != null ? String(p.updated_at) : null,
  };
}

/** Batch-load plans + prices + benefits (avoids N+1 per plan). */
export async function loadPlansListForAudience(
  audience: "RIDER" | "CUSTOMER",
  search?: string
): Promise<LoadedSubscriptionPlan[]> {
  const sql = getSql();
  const q = search?.trim() ? `%${search.trim()}%` : null;

  const planRows = q
    ? await sql`
        SELECT * FROM subscription_plans
        WHERE plan_audience = ${audience}::public.subscription_plan_audience
          AND (name ILIKE ${q} OR code ILIKE ${q})
        ORDER BY is_featured DESC, display_order ASC, id ASC
      `
    : await sql`
        SELECT * FROM subscription_plans
        WHERE plan_audience = ${audience}::public.subscription_plan_audience
        ORDER BY is_featured DESC, display_order ASC, id ASC
      `;

  const plans = (planRows as Record<string, unknown>[]).map(mapPlanRow);
  if (plans.length === 0) return [];

  const ids = plans.map((p) => p.id);
  const [priceRows, benefitRows] = await Promise.all([
    sql`SELECT * FROM subscription_plan_prices WHERE plan_id = ANY(${ids}::bigint[]) ORDER BY plan_id, billing_cycle`,
    sql`SELECT * FROM subscription_plan_benefits WHERE plan_id = ANY(${ids}::bigint[]) ORDER BY plan_id, display_order ASC, id ASC`,
  ]);

  const pricesByPlan = new Map<number, LoadedSubscriptionPlan["prices"]>();
  for (const r of priceRows as Record<string, unknown>[]) {
    const planId = Number(r.plan_id);
    const subtotal = Number(r.amount ?? 0);
    const gstPercent = r.gst_percent != null ? Number(r.gst_percent) : 18;
    const gstAmount = Math.round((subtotal * gstPercent) / 100 * 100) / 100;
    const total = Math.round((subtotal + gstAmount) * 100) / 100;
    const list = pricesByPlan.get(planId) ?? [];
    list.push({
      id: Number(r.id),
      billingCycle: String(r.billing_cycle ?? ""),
      amount: subtotal,
      gstPercent,
      gstAmount,
      totalAmount: total,
      autoWalletDeduction: Boolean(r.auto_wallet_deduction),
      isActive: Boolean(r.is_active),
    });
    pricesByPlan.set(planId, list);
  }

  const benefitsByPlan = new Map<number, LoadedSubscriptionPlan["benefits"]>();
  const seenLabels = new Map<number, Set<string>>();
  for (const r of benefitRows as Record<string, unknown>[]) {
    const planId = Number(r.plan_id);
    const label = (r.display_label != null ? String(r.display_label) : String(r.benefit_key ?? "")).trim();
    const key = label.toLowerCase();
    if (!key) continue;
    const seen = seenLabels.get(planId) ?? new Set<string>();
    if (seen.has(key)) continue;
    seen.add(key);
    seenLabels.set(planId, seen);
    const list = benefitsByPlan.get(planId) ?? [];
    list.push({
      id: Number(r.id),
      benefitKey: String(r.benefit_key ?? ""),
      benefitValue: String(r.benefit_value ?? ""),
      displayLabel: r.display_label != null ? String(r.display_label) : null,
      displayOrder: Number(r.display_order ?? 0),
    });
    benefitsByPlan.set(planId, list);
  }

  return plans.map((p) => ({
    ...p,
    prices: pricesByPlan.get(p.id) ?? [],
    benefits: benefitsByPlan.get(p.id) ?? [],
  }));
}

export async function loadCustomerSubscriptionStats() {
  const sql = getSql();
  try {
    const [subRow] = await sql`
      SELECT COUNT(DISTINCT customer_id)::int AS cnt
      FROM customer_subscriptions
      WHERE status = 'active' AND expires_at > NOW()
    `;
    const [revRow] = await sql`
      SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total
      FROM customer_subscriptions
      WHERE created_at >= date_trunc('month', NOW())
    `;
    const [prevSubRow] = await sql`
      SELECT COUNT(DISTINCT customer_id)::int AS cnt
      FROM customer_subscriptions
      WHERE status = 'active'
        AND created_at >= date_trunc('month', NOW() - interval '1 month')
        AND created_at < date_trunc('month', NOW())
    `;
    const [prevRevRow] = await sql`
      SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total
      FROM customer_subscriptions
      WHERE created_at >= date_trunc('month', NOW() - interval '1 month')
        AND created_at < date_trunc('month', NOW())
    `;
    const [customerRow] = await sql`
      SELECT COUNT(*)::int AS cnt FROM customers
    `;

    const subscribers = Number((subRow as { cnt?: number })?.cnt ?? 0);
    const prevSubscribers = Number((prevSubRow as { cnt?: number })?.cnt ?? 0);
    const monthlyRevenueInr = Number((revRow as { total?: number })?.total ?? 0);
    const prevRevenue = Number((prevRevRow as { total?: number })?.total ?? 0);
    const totalCustomers = Number((customerRow as { cnt?: number })?.cnt ?? 0);

    const pctChange = (current: number, previous: number) =>
      previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null;

    return {
      totalSubscribers: subscribers,
      subscriberGrowthPct: pctChange(subscribers, prevSubscribers),
      monthlyRevenueInr,
      revenueGrowthPct: pctChange(monthlyRevenueInr, prevRevenue),
      conversionRatePct:
        totalCustomers > 0 ? Math.round((subscribers / totalCustomers) * 1000) / 10 : null,
      conversionGrowthPct: null as number | null,
    };
  } catch {
    return {
      totalSubscribers: 0,
      subscriberGrowthPct: null,
      monthlyRevenueInr: 0,
      revenueGrowthPct: null,
      conversionRatePct: null,
      conversionGrowthPct: null,
    };
  }
}

export async function loadRiderSubscriptionStats() {
  const sql = getSql();
  try {
    const [subRow] = await sql`
      SELECT COUNT(*)::int AS cnt
      FROM rider_subscriptions
      WHERE status = 'active' AND end_date > NOW()
    `;
    const [revRow] = await sql`
      SELECT COALESCE(SUM(amount_paid), 0)::numeric AS total
      FROM rider_subscriptions
      WHERE status = 'active'
        AND end_date > NOW()
        AND created_at >= date_trunc('month', NOW())
    `;
    return {
      subscribedRiders: Number((subRow as { cnt?: number })?.cnt ?? 0),
      monthlyRevenueInr: Number((revRow as { total?: number })?.total ?? 0),
    };
  } catch {
    return { subscribedRiders: 0, monthlyRevenueInr: 0 };
  }
}
