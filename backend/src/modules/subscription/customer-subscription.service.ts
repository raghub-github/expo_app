/**
 * Customer subscription plans (GMitra Plus) — managed from Super Admin.
 */

import { eq } from "drizzle-orm";
import { getSql, getDb } from "../../db/client.js";
import { customers } from "../../db/schema.js";
import { getEnv } from "../../config/env.js";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
} from "../../services/payment/razorpayService.js";
import { priceWithGst } from "../rider/rider-subscription.service.js";
import {
  applyCustomerSubscriptionToBilling,
  type SubscriptionBillingAdjustmentInput,
} from "./customer-subscription-billing.js";
import type { BillingResult } from "../billing/types.js";

export type CustomerBillingCycle = "weekly" | "monthly" | "yearly";

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
  default_billing_cycle: CustomerBillingCycle | null;
  is_active: boolean;
  is_featured: boolean;
  free_delivery_enabled: boolean;
  max_free_delivery_radius_km: number;
  discount_percentage: number | null;
  cashback_enabled: boolean;
  cashback_percentage: number | null;
  priority_support: boolean;
};

function cycleLabel(cycle: string): string {
  switch (cycle) {
    case "weekly":
      return "week";
    case "monthly":
      return "month";
    case "yearly":
      return "year";
    default:
      return cycle.replace(/_/g, " ");
  }
}

function addBillingPeriod(start: Date, cycle: CustomerBillingCycle): Date {
  const end = new Date(start);
  switch (cycle) {
    case "weekly":
      end.setDate(end.getDate() + 7);
      break;
    case "monthly":
      end.setMonth(end.getMonth() + 1);
      break;
    case "yearly":
      end.setFullYear(end.getFullYear() + 1);
      break;
    default:
      end.setMonth(end.getMonth() + 1);
  }
  return end;
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

async function loadPlanPrices(sql: ReturnType<typeof getSql>, planId: number, activeOnly: boolean) {
  let rows: Record<string, unknown>[];
  try {
    rows = activeOnly
      ? await sql`
          SELECT id, billing_cycle, amount, gst_percent, is_active
          FROM subscription_plan_prices
          WHERE plan_id = ${planId} AND is_active = true
          ORDER BY
            CASE billing_cycle
              WHEN 'weekly' THEN 1
              WHEN 'monthly' THEN 2
              WHEN 'yearly' THEN 3
              ELSE 4
            END
        `
      : await sql`
          SELECT id, billing_cycle, amount, gst_percent, is_active
          FROM subscription_plan_prices
          WHERE plan_id = ${planId}
          ORDER BY
            CASE billing_cycle
              WHEN 'weekly' THEN 1
              WHEN 'monthly' THEN 2
              WHEN 'yearly' THEN 3
              ELSE 4
            END
        `;
  } catch (err: unknown) {
    if ((err as { code?: string })?.code !== "42703") throw err;
    rows = activeOnly
      ? await sql`
          SELECT id, billing_cycle, amount, is_active
          FROM subscription_plan_prices
          WHERE plan_id = ${planId} AND is_active = true
          ORDER BY id ASC
        `
      : await sql`
          SELECT id, billing_cycle, amount, is_active
          FROM subscription_plan_prices
          WHERE plan_id = ${planId}
          ORDER BY id ASC
        `;
  }

  return (Array.isArray(rows) ? rows : []).map((r) => {
    const row = r as Record<string, unknown>;
    const subtotal = Number(row.amount ?? 0);
    const gstPercent = row.gst_percent != null ? Number(row.gst_percent) : 18;
    const gst = priceWithGst(subtotal, gstPercent);
    const cycle = String(row.billing_cycle);
    return {
      id: Number(row.id),
      billingCycle: cycle,
      amount: subtotal,
      gstPercent: gst.gstPercent,
      gstAmount: gst.gstAmount,
      totalAmount: gst.total,
      totalPaise: gst.totalPaise,
      cycleLabel: cycleLabel(cycle),
      isActive: row.is_active !== false,
    };
  });
}

function mapCustomerPlan(
  plan: PlanRow,
  benefits: Awaited<ReturnType<typeof loadPlanBenefits>>,
  prices: Awaited<ReturnType<typeof loadPlanPrices>>
) {
  const defaultCycle = (plan.default_billing_cycle ?? prices[0]?.billingCycle ?? "monthly") as string;
  const featuredPrice =
    prices.find((p) => p.billingCycle === defaultCycle) ?? prices[0] ?? null;

  return {
    id: plan.id,
    code: plan.code,
    planName: plan.name,
    name: plan.name,
    description: plan.description,
    badgeText: plan.badge_text,
    badgeColor: plan.badge_color ?? "#059669",
    headline: plan.headline,
    ctaLabel: plan.cta_label ?? "Subscribe",
    displayOrder: plan.display_order,
    isActive: plan.is_active,
    isFeatured: plan.is_featured,
    defaultBillingCycle: defaultCycle,
    freeDeliveryEnabled: plan.free_delivery_enabled,
    maxFreeDeliveryRadiusKm: Number(plan.max_free_delivery_radius_km ?? 7),
    discountPercentage: plan.discount_percentage != null ? Number(plan.discount_percentage) : null,
    cashbackEnabled: plan.cashback_enabled,
    cashbackPercentage: plan.cashback_percentage != null ? Number(plan.cashback_percentage) : null,
    prioritySupport: plan.priority_support,
    benefits: benefits.map((b) => b.label),
    benefitDetails: benefits,
    prices,
    featuredPrice: featuredPrice
      ? {
          billingCycle: featuredPrice.billingCycle,
          cycleLabel: featuredPrice.cycleLabel,
          subtotal: featuredPrice.amount,
          gstPercent: featuredPrice.gstPercent,
          gstAmount: featuredPrice.gstAmount,
          total: featuredPrice.totalAmount,
          totalPaise: featuredPrice.totalPaise,
        }
      : null,
  };
}

async function loadCustomerPlanRow(sql: ReturnType<typeof getSql>, planId: number): Promise<PlanRow | null> {
  try {
    const rows = await sql`
      SELECT
        id, code, name, description, badge_text, badge_color, headline, cta_label,
        display_order, default_billing_cycle, is_active, is_featured,
        free_delivery_enabled, max_free_delivery_radius_km,
        discount_percentage, cashback_enabled, cashback_percentage, priority_support
      FROM subscription_plans
      WHERE id = ${planId}
        AND plan_audience = 'CUSTOMER'
      LIMIT 1
    `;
    const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      id: Number(row.id),
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      description: row.description != null ? String(row.description) : null,
      badge_text: row.badge_text != null ? String(row.badge_text) : null,
      badge_color: row.badge_color != null ? String(row.badge_color) : null,
      headline: row.headline != null ? String(row.headline) : null,
      cta_label: row.cta_label != null ? String(row.cta_label) : null,
      display_order: Number(row.display_order ?? 0),
      default_billing_cycle: row.default_billing_cycle
        ? (String(row.default_billing_cycle) as CustomerBillingCycle)
        : null,
      is_active: row.is_active !== false,
      is_featured: row.is_featured === true,
      free_delivery_enabled: row.free_delivery_enabled === true,
      max_free_delivery_radius_km: Number(row.max_free_delivery_radius_km ?? 7),
      discount_percentage: row.discount_percentage != null ? Number(row.discount_percentage) : null,
      cashback_enabled: row.cashback_enabled === true,
      cashback_percentage: row.cashback_percentage != null ? Number(row.cashback_percentage) : null,
      priority_support: row.priority_support === true,
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "42703" || code === "42P01") return null;
    throw err;
  }
}

export async function listCustomerSubscriptionPlans(activeOnly = false) {
  const sql = getSql();
  try {
    const plans = activeOnly
      ? await sql`
          SELECT id
          FROM subscription_plans
          WHERE plan_audience = 'CUSTOMER' AND is_active = true
          ORDER BY is_featured DESC, display_order ASC, id ASC
        `
      : await sql`
          SELECT id
          FROM subscription_plans
          WHERE plan_audience = 'CUSTOMER'
          ORDER BY is_featured DESC, display_order ASC, id ASC
        `;

    const result = [];
    for (const p of Array.isArray(plans) ? plans : []) {
      const planId = Number((p as { id: number }).id);
      const plan = await loadCustomerPlanRow(sql, planId);
      if (!plan) continue;
      if (activeOnly && !plan.is_active) continue;
      const [benefits, prices] = await Promise.all([
        loadPlanBenefits(sql, planId),
        loadPlanPrices(sql, planId, activeOnly),
      ]);
      if (activeOnly && prices.length === 0) continue;
      result.push(mapCustomerPlan(plan, benefits, prices));
    }
    return { ok: true as const, plans: result };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01" || code === "42703") {
      return { ok: true as const, plans: [] };
    }
    throw err;
  }
}

export async function getActiveCustomerSubscription(customerId: number) {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT
        cs.id,
        cs.plan_id,
        cs.billing_cycle,
        cs.status,
        cs.starts_at,
        cs.expires_at,
        cs.amount_paid,
        p.code,
        p.name,
        p.free_delivery_enabled,
        p.max_free_delivery_radius_km,
        p.discount_percentage,
        p.cashback_enabled,
        p.cashback_percentage,
        p.priority_support,
        p.badge_text
      FROM customer_subscriptions cs
      JOIN subscription_plans p ON p.id = cs.plan_id
      WHERE cs.customer_id = ${customerId}
        AND cs.status = 'active'
        AND cs.expires_at > NOW()
        AND p.plan_audience = 'CUSTOMER'
        AND p.is_active = true
      ORDER BY cs.created_at DESC
      LIMIT 1
    `;
    const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
    if (!row) return { ok: true as const, active: false, subscription: null, plan: null };

    const [benefits] = await Promise.all([loadPlanBenefits(sql, Number(row.plan_id))]);

    return {
      ok: true as const,
      active: true,
      subscription: {
        id: Number(row.id),
        planId: Number(row.plan_id),
        planName: String(row.name ?? ""),
        planCode: String(row.code ?? ""),
        billingCycle: String(row.billing_cycle ?? ""),
        status: String(row.status ?? "active"),
        startsAt: row.starts_at instanceof Date ? row.starts_at.toISOString() : String(row.starts_at ?? ""),
        expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at ?? ""),
        amountPaid: row.amount_paid != null ? Number(row.amount_paid) : null,
      },
      plan: {
        planId: Number(row.plan_id),
        planName: String(row.name ?? ""),
        badgeText: row.badge_text != null ? String(row.badge_text) : null,
        freeDeliveryEnabled: row.free_delivery_enabled === true,
        maxFreeDeliveryRadiusKm: Number(row.max_free_delivery_radius_km ?? 7),
        discountPercentage: row.discount_percentage != null ? Number(row.discount_percentage) : null,
        cashbackEnabled: row.cashback_enabled === true,
        cashbackPercentage: row.cashback_percentage != null ? Number(row.cashback_percentage) : null,
        prioritySupport: row.priority_support === true,
        benefits: benefits.map((b) => b.label),
      },
    };
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code;
    if (code === "42P01" || code === "42703") {
      return { ok: true as const, active: false, subscription: null, plan: null };
    }
    throw err;
  }
}

export type SubscriptionBenefitContext = {
  planId: number;
  planName: string;
  freeDeliveryEnabled: boolean;
  maxFreeDeliveryRadiusKm: number;
  isNewOptIn: boolean;
};

/** Resolve which plan benefits apply at checkout (active sub or new opt-in). */
export async function resolveCustomerSubscriptionBenefits(args: {
  customerId: number;
  subscriptionOptIn?: boolean;
  subscriptionPlanId?: number;
  subscriptionBillingCycle?: CustomerBillingCycle;
}): Promise<SubscriptionBenefitContext | null> {
  const active = await getActiveCustomerSubscription(args.customerId);
  if (active.active && active.plan) {
    return {
      planId: active.plan.planId,
      planName: active.plan.planName,
      freeDeliveryEnabled: active.plan.freeDeliveryEnabled,
      maxFreeDeliveryRadiusKm: active.plan.maxFreeDeliveryRadiusKm,
      isNewOptIn: false,
    };
  }

  if (args.subscriptionOptIn !== true || !args.subscriptionPlanId) return null;

  const sql = getSql();
  const plan = await loadCustomerPlanRow(sql, args.subscriptionPlanId);
  if (!plan || !plan.is_active) return null;

  if (args.subscriptionBillingCycle) {
    const prices = await loadPlanPrices(sql, plan.id, true);
    const hasCycle = prices.some((p) => p.billingCycle === args.subscriptionBillingCycle);
    if (!hasCycle) return null;
  }

  return {
    planId: plan.id,
    planName: plan.name,
    freeDeliveryEnabled: plan.free_delivery_enabled,
    maxFreeDeliveryRadiusKm: Number(plan.max_free_delivery_radius_km ?? 7),
    isNewOptIn: true,
  };
}

export function isFreeDeliveryEligible(args: {
  freeDeliveryEnabled: boolean;
  maxFreeDeliveryRadiusKm: number;
  distanceKm: number | null;
  isSelfPickup?: boolean;
}): boolean {
  if (args.isSelfPickup) return false;
  if (!args.freeDeliveryEnabled) return false;
  if (args.distanceKm == null || !Number.isFinite(args.distanceKm)) return false;
  return args.distanceKm <= args.maxFreeDeliveryRadiusKm;
}

/** Billing / checkout-offers: membership benefits stack with one platform or store promo. */
export type CustomerSubscriptionBillingContext = {
  hasSubscriptionBenefits: boolean;
  freeDeliveryEligible: boolean;
  /** Unlocks SUBSCRIPTION_BENEFIT platform offers for active members and checkout opt-in. */
  effectiveSubscriptionOptIn: boolean;
  planId: number;
  planName: string;
};

export async function resolveCustomerSubscriptionBillingContext(args: {
  customerId: number;
  distanceKm: number | null;
  isSelfPickup?: boolean;
  subscriptionOptIn?: boolean;
  subscriptionPlanId?: number;
}): Promise<CustomerSubscriptionBillingContext | null> {
  const benefits = await resolveCustomerSubscriptionBenefits({
    customerId: args.customerId,
    subscriptionOptIn: args.subscriptionOptIn,
    subscriptionPlanId: args.subscriptionPlanId,
  });
  if (!benefits) return null;

  return {
    hasSubscriptionBenefits: true,
    freeDeliveryEligible: isFreeDeliveryEligible({
      freeDeliveryEnabled: benefits.freeDeliveryEnabled,
      maxFreeDeliveryRadiusKm: benefits.maxFreeDeliveryRadiusKm,
      distanceKm: args.distanceKm,
      isSelfPickup: args.isSelfPickup,
    }),
    effectiveSubscriptionOptIn: args.subscriptionOptIn === true || !benefits.isNewOptIn,
    planId: benefits.planId,
    planName: benefits.planName,
  };
}

async function loadCheckoutPrice(
  sql: ReturnType<typeof getSql>,
  planId: number,
  billingCycle: CustomerBillingCycle
) {
  const rows = await sql`
    SELECT pr.id, pr.billing_cycle, pr.amount, pr.gst_percent, p.name
    FROM subscription_plan_prices pr
    JOIN subscription_plans p ON p.id = pr.plan_id
    WHERE pr.plan_id = ${planId}
      AND pr.billing_cycle = ${billingCycle}::public.subscription_billing_cycle
      AND pr.is_active = true
      AND p.is_active = true
      AND p.plan_audience = 'CUSTOMER'
    LIMIT 1
  `;
  const r = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  if (!r) return null;
  const subtotal = Number(r.amount ?? 0);
  const gstPercent = r.gst_percent != null ? Number(r.gst_percent) : 18;
  const gst = priceWithGst(subtotal, gstPercent);
  return {
    priceId: Number(r.id),
    billingCycle,
    subtotal,
    gstPercent: gst.gstPercent,
    gstAmount: gst.gstAmount,
    total: gst.total,
    planName: String(r.name ?? "Subscription"),
  };
}

export async function applyCustomerSubscriptionBillingAdjustments(args: {
  customerId: number;
  billing: BillingResult;
  distanceKm: number | null;
  isSelfPickup?: boolean;
  subscriptionOptIn?: boolean;
  subscriptionPlanId?: number;
  subscriptionBillingCycle?: CustomerBillingCycle;
}): Promise<BillingResult> {
  const benefits = await resolveCustomerSubscriptionBenefits({
    customerId: args.customerId,
    subscriptionOptIn: args.subscriptionOptIn,
    subscriptionPlanId: args.subscriptionPlanId,
    subscriptionBillingCycle: args.subscriptionBillingCycle,
  });
  if (!benefits) return args.billing;

  const freeDeliveryEligible = isFreeDeliveryEligible({
    freeDeliveryEnabled: benefits.freeDeliveryEnabled,
    maxFreeDeliveryRadiusKm: benefits.maxFreeDeliveryRadiusKm,
    distanceKm: args.distanceKm,
    isSelfPickup: args.isSelfPickup,
  });

  let subscriptionCharge: SubscriptionBillingAdjustmentInput["subscriptionCharge"] = null;
  if (
    benefits.isNewOptIn &&
    args.subscriptionOptIn === true &&
    args.subscriptionPlanId &&
    args.subscriptionBillingCycle
  ) {
    const sql = getSql();
    const price = await loadCheckoutPrice(sql, args.subscriptionPlanId, args.subscriptionBillingCycle);
    if (price && price.subtotal >= 0) {
      subscriptionCharge = {
        subtotal: price.subtotal,
        gstAmount: price.gstAmount,
        gstPercent: price.gstPercent,
        label: `${price.planName} (${price.billingCycle.replace(/_/g, " ")})`,
      };
    }
  }

  return applyCustomerSubscriptionToBilling(args.billing, {
    planId: benefits.planId,
    planName: benefits.planName,
    freeDeliveryEligible,
    maxFreeDeliveryRadiusKm: benefits.maxFreeDeliveryRadiusKm,
    distanceKm: args.distanceKm,
    subscriptionCharge,
  });
}

async function upsertCustomerSubscription(args: {
  sql: ReturnType<typeof getSql>;
  customerId: number;
  planId: number;
  priceId: number | null;
  billingCycle: CustomerBillingCycle;
  amountPaid: number;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
}) {
  const now = new Date();
  const expiresAt = addBillingPeriod(now, args.billingCycle);

  await args.sql`
    UPDATE customer_subscriptions
    SET status = 'expired', updated_at = NOW()
    WHERE customer_id = ${args.customerId}
      AND status = 'active'
      AND expires_at > NOW()
  `;

  const inserted = await args.sql`
    INSERT INTO customer_subscriptions (
      customer_id, plan_id, price_id, billing_cycle,
      starts_at, expires_at, status, amount_paid,
      razorpay_order_id, razorpay_payment_id
    ) VALUES (
      ${args.customerId}, ${args.planId}, ${args.priceId},
      ${args.billingCycle}::public.subscription_billing_cycle,
      ${now.toISOString()}, ${expiresAt.toISOString()},
      'active', ${args.amountPaid},
      ${args.razorpayOrderId ?? null}, ${args.razorpayPaymentId ?? null}
    )
    RETURNING id
  `;

  const db = getDb();
  await db
    .update(customers)
    .set({ gmitraPlusActive: true })
    .where(eq(customers.id, args.customerId));

  return Number((inserted[0] as { id: number }).id);
}

export async function activateCustomerSubscriptionFromCheckout(args: {
  customerId: number;
  planId: number;
  billingCycle: CustomerBillingCycle;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
}) {
  const sql = getSql();
  const plan = await loadCustomerPlanRow(sql, args.planId);
  if (!plan || !plan.is_active) {
    return { ok: false as const, status: 400, error: "Invalid or inactive subscription plan" };
  }

  const price = await loadCheckoutPrice(sql, args.planId, args.billingCycle);
  if (!price) {
    return { ok: false as const, status: 400, error: "Plan price not found for billing cycle" };
  }

  const subId = await upsertCustomerSubscription({
    sql,
    customerId: args.customerId,
    planId: args.planId,
    priceId: price.priceId,
    billingCycle: args.billingCycle,
    amountPaid: price.total,
    razorpayOrderId: args.razorpayOrderId ?? null,
    razorpayPaymentId: args.razorpayPaymentId ?? null,
  });

  return { ok: true as const, subscriptionId: subId };
}

export async function createCustomerSubscriptionPaymentOrder(args: {
  customerId: number;
  planId: number;
  billingCycle: CustomerBillingCycle;
}) {
  const sql = getSql();
  const plan = await loadCustomerPlanRow(sql, args.planId);
  if (!plan || !plan.is_active) {
    return { ok: false as const, status: 404, error: "Plan not found" };
  }

  const active = await getActiveCustomerSubscription(args.customerId);
  if (active.active && active.subscription?.planId === args.planId) {
    return { ok: false as const, status: 400, error: "Already subscribed to this plan" };
  }

  const price = await loadCheckoutPrice(sql, args.planId, args.billingCycle);
  if (!price) {
    return { ok: false as const, status: 404, error: "Plan price not found" };
  }

  if (price.total <= 0) {
    const subId = await upsertCustomerSubscription({
      sql,
      customerId: args.customerId,
      planId: args.planId,
      priceId: price.priceId,
      billingCycle: args.billingCycle,
      amountPaid: 0,
    });
    return { ok: true as const, skipPayment: true, subscriptionId: subId, billingCycle: args.billingCycle };
  }

  const env = getEnv();
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return { ok: false as const, status: 503, error: "Payment gateway not configured" };
  }

  const receipt = `cust_sub_${args.customerId}_${args.planId}_${args.billingCycle}_${Date.now()}`;
  const order = await createRazorpayOrder({
    amount: Math.round(price.total * 100),
    currency: "INR",
    receipt,
    notes: {
      type: "customer_subscription",
      customer_id: String(args.customerId),
      plan_id: String(args.planId),
      price_id: String(price.priceId),
      billing_cycle: args.billingCycle,
      gst_percent: String(price.gstPercent),
    },
  });

  return {
    ok: true as const,
    skipPayment: false,
    orderId: order.id,
    keyId: env.RAZORPAY_KEY_ID,
    amount: Math.round(price.total * 100),
    subtotalPaise: Math.round(price.subtotal * 100),
    gstAmountPaise: Math.round(price.gstAmount * 100),
    gstPercent: price.gstPercent,
    currency: "INR",
    billingCycle: args.billingCycle,
    plan: {
      id: args.planId,
      name: price.planName,
      subtotal: price.subtotal,
      gstAmount: price.gstAmount,
      total: price.total,
      billingCycle: args.billingCycle,
    },
  };
}

export async function verifyCustomerSubscriptionPayment(args: {
  customerId: number;
  planId: number;
  billingCycle: CustomerBillingCycle;
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
  const price = await loadCheckoutPrice(sql, args.planId, args.billingCycle);
  if (!price) {
    return { ok: false as const, status: 404, error: "Plan price not found" };
  }

  const subId = await upsertCustomerSubscription({
    sql,
    customerId: args.customerId,
    planId: args.planId,
    priceId: price.priceId,
    billingCycle: args.billingCycle,
    amountPaid: price.total,
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
  });

  return { ok: true as const, subscriptionId: subId, success: true };
}

export async function maybeActivateSubscriptionFromOrderMetadata(args: {
  customerId: number;
  checkoutMetadata: Record<string, unknown> | null | undefined;
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
}) {
  const meta = args.checkoutMetadata;
  if (!meta || meta.subscriptionOptIn !== true) return { activated: false as const };

  const planId = Number(meta.subscriptionPlanId);
  const billingCycle = String(meta.subscriptionBillingCycle ?? "") as CustomerBillingCycle;
  if (!Number.isFinite(planId) || planId <= 0) return { activated: false as const };
  if (!["weekly", "monthly", "yearly"].includes(billingCycle)) {
    return { activated: false as const };
  }

  const result = await activateCustomerSubscriptionFromCheckout({
    customerId: args.customerId,
    planId,
    billingCycle,
    razorpayOrderId: args.razorpayOrderId ?? null,
    razorpayPaymentId: args.razorpayPaymentId ?? null,
  });

  return { activated: result.ok, subscriptionId: result.ok ? result.subscriptionId : undefined };
}
