/**
 * GMitra Max rider subscriptions — subscription_plans / prices / benefits tables.
 */

import { getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
} from "../../services/payment/razorpayService.js";

export type BillingCycle = "daily" | "monthly" | "semi_yearly" | "yearly";

type PlanPriceRow = {
  id: number;
  billing_cycle: BillingCycle;
  amount: number;
  gst_percent: number;
  auto_wallet_deduction: boolean;
};

type PlanRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  badge_text: string | null;
  badge_color: string | null;
  headline: string | null;
  cta_label: string | null;
  display_order: number;
  default_billing_cycle: BillingCycle;
};

export function priceWithGst(subtotal: number, gstPercent: number) {
  const gp = Number.isFinite(gstPercent) && gstPercent >= 0 && gstPercent <= 100 ? gstPercent : 0;
  const gstAmount = Math.round((subtotal * gp) / 100 * 100) / 100;
  const total = Math.round((subtotal + gstAmount) * 100) / 100;
  return { subtotal, gstPercent: gp, gstAmount, total, totalPaise: Math.round(total * 100) };
}

function addBillingPeriod(start: Date, cycle: BillingCycle): Date {
  const end = new Date(start);
  switch (cycle) {
    case "daily":
      end.setDate(end.getDate() + 1);
      break;
    case "monthly":
      end.setMonth(end.getMonth() + 1);
      break;
    case "semi_yearly":
      end.setMonth(end.getMonth() + 6);
      break;
    case "yearly":
      end.setFullYear(end.getFullYear() + 1);
      break;
    default:
      end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function cycleLabel(cycle: BillingCycle): string {
  switch (cycle) {
    case "daily":
      return "day";
    case "monthly":
      return "month";
    case "semi_yearly":
      return "6 months";
    case "yearly":
      return "year";
    default:
      return cycle;
  }
}

async function loadPlanBenefits(sql: ReturnType<typeof getSql>, planId: number) {
  const rows = await sql`
    SELECT benefit_key, benefit_value, display_label, display_order
    FROM subscription_plan_benefits
    WHERE plan_id = ${planId}
    ORDER BY display_order ASC, id ASC
  `;
  const seen = new Set<string>();
  return (Array.isArray(rows) ? rows : [])
    .map((r) => {
      const row = r as Record<string, unknown>;
      return {
        key: String(row.benefit_key ?? ""),
        value: String(row.benefit_value ?? ""),
        label: row.display_label != null ? String(row.display_label) : String(row.benefit_key ?? ""),
      };
    })
    .filter((b) => {
      const labelKey = b.label.trim().toLowerCase();
      if (!labelKey || seen.has(labelKey)) return false;
      seen.add(labelKey);
      return true;
    });
}

async function loadPlanPrices(sql: ReturnType<typeof getSql>, planId: number) {
  let rows: Record<string, unknown>[];
  try {
    rows = await sql`
      SELECT id, billing_cycle, amount, gst_percent, auto_wallet_deduction
      FROM subscription_plan_prices
      WHERE plan_id = ${planId} AND is_active = true
      ORDER BY
        CASE billing_cycle
          WHEN 'daily' THEN 1
          WHEN 'monthly' THEN 2
          WHEN 'semi_yearly' THEN 3
          WHEN 'yearly' THEN 4
          ELSE 5
        END
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    rows = await sql`
      SELECT id, billing_cycle, amount, auto_wallet_deduction
      FROM subscription_plan_prices
      WHERE plan_id = ${planId} AND is_active = true
      ORDER BY id ASC
    `;
  }

  return (Array.isArray(rows) ? rows : []).map((r) => {
    const row = r as Record<string, unknown>;
    const subtotal = Number(row.amount ?? 0);
    const gstPercent = row.gst_percent != null ? Number(row.gst_percent) : 18;
    const gst = priceWithGst(subtotal, gstPercent);
    const cycle = String(row.billing_cycle) as BillingCycle;
    return {
      id: Number(row.id),
      billingCycle: cycle,
      amount: subtotal,
      gstPercent: gst.gstPercent,
      gstAmount: gst.gstAmount,
      totalAmount: gst.total,
      totalPaise: gst.totalPaise,
      autoWalletDeduction: Boolean(row.auto_wallet_deduction),
      cycleLabel: cycleLabel(cycle),
    };
  });
}

function mapPlan(
  plan: PlanRow,
  benefits: Awaited<ReturnType<typeof loadPlanBenefits>>,
  prices: Awaited<ReturnType<typeof loadPlanPrices>>
) {
  const featured =
    prices.find((p) => p.billingCycle === plan.default_billing_cycle) ?? prices[0] ?? null;

  return {
    id: plan.id,
    code: plan.code,
    planName: plan.name,
    planCode: plan.code,
    description: plan.description,
    badgeText: plan.badge_text ?? "POPULAR",
    badgeColor: plan.badge_color ?? "#7C3AED",
    headline: plan.headline ?? "Earn More. Get Priority. Grow Faster.",
    tagline: plan.headline ?? "Earn More. Get Priority. Grow Faster.",
    ctaLabel: plan.cta_label ?? "Subscribe now",
    displayOrder: plan.display_order,
    defaultBillingCycle: plan.default_billing_cycle,
    benefits: benefits.map((b) => b.label),
    benefitDetails: benefits,
    prices,
    featuredPrice: featured
      ? {
          billingCycle: featured.billingCycle,
          cycleLabel: featured.cycleLabel,
          subtotal: featured.amount,
          gstPercent: featured.gstPercent,
          gstAmount: featured.gstAmount,
          total: featured.totalAmount,
          totalPaise: featured.totalPaise,
        }
      : null,
  };
}

export async function listRiderSubscriptionPlans() {
  const sql = getSql();
  try {
    let plans: Record<string, unknown>[];
    try {
      plans = await sql`
        SELECT id, code, name, description, badge_text, badge_color, headline, cta_label, display_order, default_billing_cycle
        FROM subscription_plans
        WHERE is_active = true
        ORDER BY display_order ASC, id ASC
      `;
    } catch (err: unknown) {
      if ((err as { code?: string })?.code !== "42703") throw err;
      plans = await sql`
        SELECT id, code, name, description, badge_text, badge_color, headline, cta_label, display_order
        FROM subscription_plans
        WHERE is_active = true
        ORDER BY display_order ASC, id ASC
      `;
    }

    const result = [];
    for (const p of Array.isArray(plans) ? plans : []) {
      const row = p as Record<string, unknown>;
      const plan: PlanRow = {
        id: Number(row.id),
        code: String(row.code ?? ""),
        name: String(row.name ?? ""),
        description: row.description != null ? String(row.description) : null,
        badge_text: row.badge_text != null ? String(row.badge_text) : null,
        badge_color: row.badge_color != null ? String(row.badge_color) : null,
        headline: row.headline != null ? String(row.headline) : null,
        cta_label: row.cta_label != null ? String(row.cta_label) : null,
        display_order: Number(row.display_order ?? 0),
        default_billing_cycle: (row.default_billing_cycle
          ? String(row.default_billing_cycle)
          : "monthly") as BillingCycle,
      };
      const [benefits, prices] = await Promise.all([
        loadPlanBenefits(sql, plan.id),
        loadPlanPrices(sql, plan.id),
      ]);
      result.push(mapPlan(plan, benefits, prices));
    }
    return { ok: true as const, plans: result };
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === "42P01") {
      return { ok: true as const, plans: [] };
    }
    throw err;
  }
}

export async function getRiderSubscriptionStatus(riderId: number) {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT
        s.plan_id,
        s.billing_cycle,
        s.status,
        s.end_date,
        s.start_date,
        s.auto_wallet_deduction,
        p.code,
        p.name
      FROM rider_subscriptions s
      JOIN subscription_plans p ON p.id = s.plan_id
      WHERE s.rider_id = ${riderId}
        AND s.status = 'active'
        AND s.end_date > NOW()
      ORDER BY s.created_at DESC
      LIMIT 1
    `;
    const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
    if (!row) return { ok: true as const, active: false, plan: null };
    return {
      ok: true as const,
      active: true,
      plan: {
        planId: Number(row.plan_id),
        planName: String(row.name ?? ""),
        planCode: String(row.code ?? ""),
        billingCycle: String(row.billing_cycle ?? ""),
        subscriptionStatus: String(row.status ?? "active"),
        autoWalletDeduction: Boolean(row.auto_wallet_deduction),
        startDate: row.start_date instanceof Date ? row.start_date.toISOString() : String(row.start_date ?? ""),
        expiryDate: row.end_date instanceof Date ? row.end_date.toISOString() : String(row.end_date ?? ""),
      },
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01" || code === "42703") {
      return { ok: true as const, active: false, plan: null };
    }
    throw err;
  }
}

async function loadPrice(
  sql: ReturnType<typeof getSql>,
  planId: number,
  billingCycle: BillingCycle
): Promise<(PlanPriceRow & { plan: PlanRow; gst: ReturnType<typeof priceWithGst> }) | null> {
  let rows: Record<string, unknown>[];
  try {
    rows = await sql`
      SELECT
        pr.id, pr.billing_cycle, pr.amount, pr.gst_percent, pr.auto_wallet_deduction,
        p.id AS plan_id, p.code, p.name, p.description, p.badge_text, p.badge_color,
        p.headline, p.cta_label, p.display_order, p.default_billing_cycle
      FROM subscription_plan_prices pr
      JOIN subscription_plans p ON p.id = pr.plan_id
      WHERE pr.plan_id = ${planId}
        AND pr.billing_cycle = ${billingCycle}::public.subscription_billing_cycle
        AND pr.is_active = true
        AND p.is_active = true
      LIMIT 1
    `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    rows = await sql`
      SELECT
        pr.id, pr.billing_cycle, pr.amount, pr.auto_wallet_deduction,
        p.id AS plan_id, p.code, p.name, p.description, p.badge_text, p.badge_color,
        p.headline, p.cta_label, p.display_order
      FROM subscription_plan_prices pr
      JOIN subscription_plans p ON p.id = pr.plan_id
      WHERE pr.plan_id = ${planId}
        AND pr.billing_cycle = ${billingCycle}::public.subscription_billing_cycle
        AND pr.is_active = true
        AND p.is_active = true
      LIMIT 1
    `;
  }

  const r = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  if (!r) return null;

  const subtotal = Number(r.amount ?? 0);
  const gstPercent = r.gst_percent != null ? Number(r.gst_percent) : 18;
  const gst = priceWithGst(subtotal, gstPercent);

  return {
    id: Number(r.id),
    billing_cycle: String(r.billing_cycle) as BillingCycle,
    amount: subtotal,
    gst_percent: gstPercent,
    auto_wallet_deduction: Boolean(r.auto_wallet_deduction),
    gst,
    plan: {
      id: Number(r.plan_id),
      code: String(r.code ?? ""),
      name: String(r.name ?? ""),
      description: r.description != null ? String(r.description) : null,
      badge_text: r.badge_text != null ? String(r.badge_text) : null,
      badge_color: r.badge_color != null ? String(r.badge_color) : null,
      headline: r.headline != null ? String(r.headline) : null,
      cta_label: r.cta_label != null ? String(r.cta_label) : null,
      display_order: Number(r.display_order ?? 0),
      default_billing_cycle: (r.default_billing_cycle
        ? String(r.default_billing_cycle)
        : billingCycle) as BillingCycle,
    },
  };
}

async function resolveBillingCycle(
  sql: ReturnType<typeof getSql>,
  planId: number,
  billingCycle?: BillingCycle
): Promise<BillingCycle> {
  if (billingCycle) return billingCycle;
  try {
    const rows = await sql`
      SELECT default_billing_cycle FROM subscription_plans WHERE id = ${planId} LIMIT 1
    `;
    const dc = (rows[0] as { default_billing_cycle?: string } | undefined)?.default_billing_cycle;
    if (dc) return dc as BillingCycle;
  } catch {
    // column may not exist yet
  }
  return "monthly";
}

async function upsertSubscription(args: {
  sql: ReturnType<typeof getSql>;
  riderId: number;
  planId: number;
  priceId: number;
  billingCycle: BillingCycle;
  subtotal: number;
  gstPercent: number;
  gstAmount: number;
  totalPaid: number;
  autoWalletDeduction: boolean;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
}) {
  const now = new Date();
  const end = addBillingPeriod(now, args.billingCycle);
  const nextDeduction =
    args.billingCycle === "daily" && args.autoWalletDeduction ? end : null;

  const existing = await args.sql`
    SELECT id FROM rider_subscriptions
    WHERE rider_id = ${args.riderId}
      AND status IN ('active', 'paused')
      AND end_date > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const existingId = (existing[0] as { id?: number } | undefined)?.id;

  const patch = {
    planId: args.planId,
    priceId: args.priceId,
    billingCycle: args.billingCycle,
    start: now.toISOString(),
    end: end.toISOString(),
    subtotal: args.subtotal,
    gstPercent: args.gstPercent,
    gstAmount: args.gstAmount,
    totalPaid: args.totalPaid,
    autoWallet: args.autoWalletDeduction,
    lastDeduction: args.autoWalletDeduction ? now.toISOString() : null,
    nextDeduction: nextDeduction ? nextDeduction.toISOString() : null,
    orderId: args.razorpayOrderId ?? null,
    paymentId: args.razorpayPaymentId ?? null,
  };

  if (existingId) {
    try {
      await args.sql`
        UPDATE rider_subscriptions SET
          plan_id = ${patch.planId},
          price_id = ${patch.priceId},
          billing_cycle = ${patch.billingCycle}::public.subscription_billing_cycle,
          start_date = ${patch.start},
          end_date = ${patch.end},
          subtotal_amount = ${patch.subtotal},
          gst_percent_applied = ${patch.gstPercent},
          gst_amount = ${patch.gstAmount},
          amount_paid = ${patch.totalPaid},
          status = 'active',
          auto_wallet_deduction = ${patch.autoWallet},
          last_deduction_at = ${patch.lastDeduction},
          next_deduction_at = ${patch.nextDeduction},
          razorpay_order_id = COALESCE(${patch.orderId}, razorpay_order_id),
          razorpay_payment_id = COALESCE(${patch.paymentId}, razorpay_payment_id),
          updated_at = NOW()
        WHERE id = ${existingId}
      `;
    } catch (err: unknown) {
      if ((err as { code?: string })?.code !== "42703") throw err;
      await args.sql`
        UPDATE rider_subscriptions SET
          plan_id = ${patch.planId},
          price_id = ${patch.priceId},
          billing_cycle = ${patch.billingCycle}::public.subscription_billing_cycle,
          start_date = ${patch.start},
          end_date = ${patch.end},
          amount_paid = ${patch.totalPaid},
          status = 'active',
          auto_wallet_deduction = ${patch.autoWallet},
          last_deduction_at = ${patch.lastDeduction},
          next_deduction_at = ${patch.nextDeduction},
          razorpay_order_id = COALESCE(${patch.orderId}, razorpay_order_id),
          razorpay_payment_id = COALESCE(${patch.paymentId}, razorpay_payment_id),
          updated_at = NOW()
        WHERE id = ${existingId}
      `;
    }
    return Number(existingId);
  }

  try {
    const inserted = await args.sql`
      INSERT INTO rider_subscriptions (
        rider_id, plan_id, price_id, billing_cycle,
        start_date, end_date, subtotal_amount, gst_percent_applied, gst_amount, amount_paid,
        status, auto_wallet_deduction, last_deduction_at, next_deduction_at,
        razorpay_order_id, razorpay_payment_id
      ) VALUES (
        ${args.riderId}, ${patch.planId}, ${patch.priceId},
        ${patch.billingCycle}::public.subscription_billing_cycle,
        ${patch.start}, ${patch.end},
        ${patch.subtotal}, ${patch.gstPercent}, ${patch.gstAmount}, ${patch.totalPaid},
        'active', ${patch.autoWallet}, ${patch.lastDeduction}, ${patch.nextDeduction},
        ${patch.orderId}, ${patch.paymentId}
      )
      RETURNING id
    `;
    return Number((inserted[0] as { id: number }).id);
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    const inserted = await args.sql`
      INSERT INTO rider_subscriptions (
        rider_id, plan_id, price_id, billing_cycle,
        start_date, end_date, amount_paid, status,
        auto_wallet_deduction, last_deduction_at, next_deduction_at,
        razorpay_order_id, razorpay_payment_id
      ) VALUES (
        ${args.riderId}, ${patch.planId}, ${patch.priceId},
        ${patch.billingCycle}::public.subscription_billing_cycle,
        ${patch.start}, ${patch.end}, ${patch.totalPaid}, 'active',
        ${patch.autoWallet}, ${patch.lastDeduction}, ${patch.nextDeduction},
        ${patch.orderId}, ${patch.paymentId}
      )
      RETURNING id
    `;
    return Number((inserted[0] as { id: number }).id);
  }
}

export async function createRiderSubscriptionPaymentOrder(args: {
  riderId: number;
  planId: number;
  billingCycle?: BillingCycle;
  autoWalletDeduction?: boolean;
}) {
  const sql = getSql();
  const cycle = await resolveBillingCycle(sql, args.planId, args.billingCycle);
  const loaded = await loadPrice(sql, args.planId, cycle);
  if (!loaded) return { ok: false as const, status: 404, error: "Plan price not found" };

  const active = await getRiderSubscriptionStatus(args.riderId);
  if (active.active && active.plan?.planId === args.planId) {
    return { ok: false as const, status: 400, error: "Already subscribed to this plan" };
  }

  const useAutoWallet =
    cycle === "daily" && Boolean(args.autoWalletDeduction ?? loaded.auto_wallet_deduction);

  if (loaded.gst.total <= 0) {
    const subId = await upsertSubscription({
      sql,
      riderId: args.riderId,
      planId: loaded.plan.id,
      priceId: loaded.id,
      billingCycle: cycle,
      subtotal: 0,
      gstPercent: 0,
      gstAmount: 0,
      totalPaid: 0,
      autoWalletDeduction: useAutoWallet,
    });
    return { ok: true as const, skipPayment: true, subscriptionId: subId, billingCycle: cycle };
  }

  const env = getEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return { ok: false as const, status: 503, error: "Payment gateway not configured" };
  }

  const receipt = `rider_sub_${args.riderId}_${loaded.plan.id}_${cycle}_${Date.now()}`;

  const order = await createRazorpayOrder({
    amount: loaded.gst.totalPaise,
    currency: "INR",
    receipt,
    notes: {
      type: "rider_subscription",
      rider_id: String(args.riderId),
      plan_id: String(loaded.plan.id),
      price_id: String(loaded.id),
      billing_cycle: cycle,
      auto_wallet: useAutoWallet ? "true" : "false",
      gst_percent: String(loaded.gst.gstPercent),
    },
  });

  return {
    ok: true as const,
    skipPayment: false,
    orderId: order.id,
    keyId: env.RAZORPAY_KEY_ID,
    amount: loaded.gst.totalPaise,
    subtotalPaise: Math.round(loaded.gst.subtotal * 100),
    gstAmountPaise: Math.round(loaded.gst.gstAmount * 100),
    gstPercent: loaded.gst.gstPercent,
    currency: "INR",
    billingCycle: cycle,
    autoWalletDeduction: useAutoWallet,
    plan: {
      id: loaded.plan.id,
      name: loaded.plan.name,
      subtotal: loaded.gst.subtotal,
      gstAmount: loaded.gst.gstAmount,
      total: loaded.gst.total,
      billingCycle: cycle,
    },
  };
}

export async function verifyRiderSubscriptionPayment(args: {
  riderId: number;
  planId: number;
  billingCycle?: BillingCycle;
  autoWalletDeduction?: boolean;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  const allowSimulated =
    process.env.NODE_ENV !== "production" && args.razorpaySignature === "simulated_signature";

  if (
    !allowSimulated &&
    !verifyRazorpaySignature(args.razorpayOrderId, args.razorpayPaymentId, args.razorpaySignature)
  ) {
    return { ok: false as const, status: 400, error: "Invalid payment signature" };
  }

  const sql = getSql();
  const cycle = await resolveBillingCycle(sql, args.planId, args.billingCycle);
  const loaded = await loadPrice(sql, args.planId, cycle);
  if (!loaded) return { ok: false as const, status: 404, error: "Plan price not found" };

  const useAutoWallet =
    cycle === "daily" && Boolean(args.autoWalletDeduction ?? loaded.auto_wallet_deduction);

  const subId = await upsertSubscription({
    sql,
    riderId: args.riderId,
    planId: loaded.plan.id,
    priceId: loaded.id,
    billingCycle: cycle,
    subtotal: loaded.gst.subtotal,
    gstPercent: loaded.gst.gstPercent,
    gstAmount: loaded.gst.gstAmount,
    totalPaid: loaded.gst.total,
    autoWalletDeduction: useAutoWallet,
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
  });

  return { ok: true as const, subscriptionId: subId, success: true };
}
