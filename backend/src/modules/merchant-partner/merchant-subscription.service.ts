/**
 * Merchant store subscription upgrades — Partner Site parity (Razorpay + proration).
 */

import { getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
} from "../../services/payment/razorpayService.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_BILLING_DAYS = 30;

type StoreRow = { id: number; parent_id: number; store_id: string; store_name: string; store_email: string | null; store_phones: string[] | null };

type PlanRow = {
  id: number;
  plan_name: string;
  plan_code: string;
  price: number;
  gst_percent: number;
  billing_cycle: string;
};

async function loadStore(sql: ReturnType<typeof getSql>, storeId: number, parentId: number): Promise<StoreRow | null> {
  const rows = await sql`
    SELECT id, parent_id, store_id, store_name, store_email, store_phones
    FROM merchant_stores
    WHERE id = ${storeId} AND parent_id = ${parentId} AND deleted_at IS NULL
    LIMIT 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: Number(r.id),
    parent_id: Number(r.parent_id),
    store_id: String(r.store_id ?? ""),
    store_name: String(r.store_name ?? ""),
    store_email: r.store_email != null ? String(r.store_email) : null,
    store_phones: Array.isArray(r.store_phones) ? (r.store_phones as string[]) : null,
  };
}

async function loadPlan(sql: ReturnType<typeof getSql>, planId: number): Promise<PlanRow | null> {
  const rows = await sql`
    SELECT id, plan_name, plan_code, price, gst_percent, billing_cycle
    FROM merchant_plans
    WHERE id = ${planId} AND is_active = true AND plan_type = 'MERCHANT'::public.subscription_plan_type
    LIMIT 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: Number(r.id),
    plan_name: String(r.plan_name ?? ""),
    plan_code: String(r.plan_code ?? ""),
    price: Number(r.price ?? 0),
    gst_percent: r.gst_percent != null ? Number(r.gst_percent) : 0,
    billing_cycle: String(r.billing_cycle ?? "MONTHLY"),
  };
}

type ActiveSub = {
  id: number;
  plan_id: number;
  start_date: string;
  expiry_date: string | null;
};

async function loadActiveSubscription(
  sql: ReturnType<typeof getSql>,
  parentId: number,
  storeId: number
): Promise<ActiveSub | null> {
  const rows = await sql`
    SELECT id, plan_id, start_date, expiry_date
    FROM merchant_subscriptions
    WHERE merchant_id = ${parentId}
      AND store_id = ${storeId}
      AND subscription_status = 'ACTIVE'
      AND is_active = true
      AND expiry_date > NOW()
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: Number(r.id),
    plan_id: Number(r.plan_id),
    start_date: String(r.start_date ?? ""),
    expiry_date: r.expiry_date != null ? String(r.expiry_date) : null,
  };
}

function computeUpgradeCharge(
  newPlanPrice: number,
  activeSub: ActiveSub | null,
  currentPrice: number
): { amountToCharge: number; creditApplied: number; isUpgrade: boolean } {
  let amountToCharge = newPlanPrice;
  let creditApplied = 0;
  let isUpgrade = false;

  if (activeSub && newPlanPrice > 0 && currentPrice > 0 && newPlanPrice > currentPrice) {
    isUpgrade = true;
    const start = new Date(activeSub.start_date);
    const expiry = activeSub.expiry_date ? new Date(activeSub.expiry_date) : null;
    const now = new Date();
    const totalDays = expiry
      ? Math.max(1, Math.round((expiry.getTime() - start.getTime()) / MS_PER_DAY))
      : DEFAULT_BILLING_DAYS;
    const usedDays = Math.max(0, Math.min(totalDays, Math.round((now.getTime() - start.getTime()) / MS_PER_DAY)));
    const usedAmount = (currentPrice / totalDays) * usedDays;
    const remainingCredit = Math.max(0, currentPrice - usedAmount);
    creditApplied = Math.min(remainingCredit, newPlanPrice);
    amountToCharge = Math.max(0, Math.round((newPlanPrice - creditApplied) * 100) / 100);
  }

  return { amountToCharge, creditApplied, isUpgrade };
}

function gstBreakdown(amountToCharge: number, gstPercent: number) {
  const gp = Number.isFinite(gstPercent) && gstPercent >= 0 && gstPercent <= 100 ? gstPercent : 0;
  const subtotalPaise = Math.round(amountToCharge * 100);
  const gstAmountPaise = Math.round((subtotalPaise * gp) / 100);
  return { gstPercent: gp, subtotalPaise, gstAmountPaise, totalPaise: subtotalPaise + gstAmountPaise };
}

export async function createMerchantSubscriptionPaymentOrder(args: {
  storeId: number;
  parentId: number;
  planId: number;
}) {
  const env = getEnv();
  const sql = getSql();
  const store = await loadStore(sql, args.storeId, args.parentId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };

  const plan = await loadPlan(sql, args.planId);
  if (!plan) return { ok: false as const, status: 404, error: "Plan not found" };

  const newPlanPrice = plan.price;
  if (newPlanPrice <= 0) {
    return { ok: false as const, status: 400, error: "Use activate-free for free plans" };
  }

  const activeSub = await loadActiveSubscription(sql, store.parent_id, store.id);
  let currentPrice = 0;
  if (activeSub) {
    const cur = await loadPlan(sql, activeSub.plan_id);
    currentPrice = cur?.price ?? 0;
    if (cur?.id === plan.id) {
      return { ok: false as const, status: 400, error: "Already on this plan" };
    }
    if (currentPrice > newPlanPrice) {
      return { ok: false as const, status: 400, error: "Downgrade not allowed via upgrade" };
    }
  }

  const { amountToCharge, creditApplied, isUpgrade } = computeUpgradeCharge(
    newPlanPrice,
    activeSub,
    currentPrice
  );

  if (amountToCharge <= 0) {
    return {
      ok: true as const,
      skipPayment: true,
      isUpgrade,
      creditApplied,
      amountToCharge: 0,
      plan: { id: plan.id, name: plan.plan_name, price: plan.price },
    };
  }

  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
    return { ok: false as const, status: 503, error: "Payment gateway not configured" };
  }

  const { gstPercent, subtotalPaise, gstAmountPaise, totalPaise } = gstBreakdown(
    amountToCharge,
    plan.gst_percent
  );
  const receipt = `plan_${isUpgrade ? "upgrade" : "new"}_${store.id}_${plan.id}_${Date.now()}`;

  const order = await createRazorpayOrder({
    amount: totalPaise,
    currency: "INR",
    receipt,
    notes: {
      store_id: store.store_id,
      store_name: store.store_name,
      plan_id: String(plan.id),
      plan_name: plan.plan_name,
      merchant_store_pk: String(store.id),
    },
  });

  return {
    ok: true as const,
    skipPayment: false,
    orderId: order.id,
    keyId: env.RAZORPAY_KEY_ID,
    amount: totalPaise,
    currency: "INR",
    isUpgrade,
    amountToCharge,
    subtotalPaise,
    gstPercent,
    gstAmountPaise,
    creditApplied: isUpgrade ? creditApplied : undefined,
    plan: { id: plan.id, name: plan.plan_name, price: plan.price },
  };
}

export async function activateFreeMerchantPlan(args: {
  storeId: number;
  parentId: number;
  planId: number;
}) {
  const sql = getSql();
  const store = await loadStore(sql, args.storeId, args.parentId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };

  const plan = await loadPlan(sql, args.planId);
  if (!plan) return { ok: false as const, status: 404, error: "Plan not found" };
  if (plan.price > 0) {
    return { ok: false as const, status: 400, error: "Plan is not free" };
  }

  const activeSub = await loadActiveSubscription(sql, store.parent_id, store.id);
  if (activeSub) {
    const cur = await loadPlan(sql, activeSub.plan_id);
    if (cur && cur.price > 0) {
      return {
        ok: false as const,
        status: 400,
        error: "Paid plan still active. Wait until it expires to switch to Free.",
      };
    }
  }

  const now = new Date();
  const expiry = new Date(now);
  expiry.setMonth(expiry.getMonth() + 1);

  const existing = await sql`
    SELECT id FROM merchant_subscriptions
    WHERE merchant_id = ${store.parent_id} AND store_id = ${store.id}
      AND subscription_status = 'ACTIVE'
    LIMIT 1
  `;
  const existingId = (existing[0] as { id?: number } | undefined)?.id;

  if (existingId) {
    await sql`
      UPDATE merchant_subscriptions SET
        plan_id = ${plan.id},
        subscription_status = 'ACTIVE',
        payment_status = 'PAID',
        start_date = ${now.toISOString()},
        expiry_date = ${expiry.toISOString()},
        is_active = true,
        updated_at = NOW()
      WHERE id = ${existingId}
    `;
    return { ok: true as const, subscriptionId: existingId };
  }

  const inserted = await sql`
    INSERT INTO merchant_subscriptions (
      merchant_id, store_id, plan_id, subscription_status, payment_status,
      start_date, expiry_date, is_active, auto_renew
    ) VALUES (
      ${store.parent_id}, ${store.id}, ${plan.id}, 'ACTIVE', 'PAID',
      ${now.toISOString()}, ${expiry.toISOString()}, true, false
    )
    RETURNING id
  `;
  const subId = Number((inserted[0] as { id: number }).id);
  return { ok: true as const, subscriptionId: subId };
}

export async function verifyMerchantSubscriptionPayment(args: {
  storeId: number;
  parentId: number;
  planId: number;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  if (
    !verifyRazorpaySignature(
      args.razorpayOrderId,
      args.razorpayPaymentId,
      args.razorpaySignature
    )
  ) {
    return { ok: false as const, status: 400, error: "Invalid payment signature" };
  }

  const sql = getSql();
  const store = await loadStore(sql, args.storeId, args.parentId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };

  const plan = await loadPlan(sql, args.planId);
  if (!plan) return { ok: false as const, status: 404, error: "Plan not found" };

  const activeSub = await loadActiveSubscription(sql, store.parent_id, store.id);
  const isUpgrade = !!(activeSub && activeSub.plan_id !== plan.id);

  if (isUpgrade) {
    return upgradeMerchantSubscription({
      storeId: args.storeId,
      parentId: args.parentId,
      newPlanId: args.planId,
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId,
      razorpaySignature: args.razorpaySignature,
    });
  }

  const now = new Date();
  const expiry = new Date(now);
  expiry.setMonth(expiry.getMonth() + 1);
  const { gstPercent, subtotalPaise, gstAmountPaise, totalPaise } = gstBreakdown(
    plan.price,
    plan.gst_percent
  );

  const existing = await sql`
    SELECT id FROM merchant_subscriptions
    WHERE merchant_id = ${store.parent_id} AND store_id = ${store.id}
      AND subscription_status = 'ACTIVE'
    LIMIT 1
  `;
  let subscriptionId: number;
  const existingId = (existing[0] as { id?: number } | undefined)?.id;

  if (existingId) {
    await sql`
      UPDATE merchant_subscriptions SET
        plan_id = ${plan.id}, subscription_status = 'ACTIVE', payment_status = 'PAID',
        start_date = ${now.toISOString()}, expiry_date = ${expiry.toISOString()},
        is_active = true, last_payment_date = ${now.toISOString()},
        next_billing_date = ${expiry.toISOString()}, updated_at = NOW()
      WHERE id = ${existingId}
    `;
    subscriptionId = existingId;
  } else {
    const ins = await sql`
      INSERT INTO merchant_subscriptions (
        merchant_id, store_id, plan_id, subscription_status, payment_status,
        start_date, expiry_date, is_active, auto_renew, last_payment_date, next_billing_date
      ) VALUES (
        ${store.parent_id}, ${store.id}, ${plan.id}, 'ACTIVE', 'PAID',
        ${now.toISOString()}, ${expiry.toISOString()}, true, false,
        ${now.toISOString()}, ${expiry.toISOString()}
      )
      RETURNING id
    `;
    subscriptionId = Number((ins[0] as { id: number }).id);
  }

  await insertSubscriptionPayment(sql, {
    merchantId: store.parent_id,
    storeId: store.id,
    subscriptionId,
    planId: plan.id,
    totalPaise,
    subtotalPaise,
    gstPercent,
    gstAmountPaise,
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
    razorpaySignature: args.razorpaySignature,
    gateway: "RAZORPAY",
    gatewayId: args.razorpayPaymentId,
    now,
    expiry,
  });

  return { ok: true as const, subscriptionId, message: "Subscription activated" };
}

export async function upgradeMerchantSubscription(args: {
  storeId: number;
  parentId: number;
  newPlanId: number;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  skipPayment?: boolean;
}) {
  const sql = getSql();
  const store = await loadStore(sql, args.storeId, args.parentId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };

  const newPlan = await loadPlan(sql, args.newPlanId);
  if (!newPlan || newPlan.price <= 0) {
    return { ok: false as const, status: 400, error: "Invalid plan for upgrade" };
  }

  const activeSub = await loadActiveSubscription(sql, store.parent_id, store.id);
  let currentPrice = 0;
  if (activeSub) {
    const cur = await loadPlan(sql, activeSub.plan_id);
    currentPrice = cur?.price ?? 0;
    if (cur?.id === newPlan.id) {
      return { ok: false as const, status: 400, error: "Already on this plan" };
    }
    if (currentPrice > newPlan.price) {
      return { ok: false as const, status: 400, error: "Downgrade not allowed" };
    }
  }

  const { amountToCharge, creditApplied } = computeUpgradeCharge(
    newPlan.price,
    activeSub,
    currentPrice
  );

  const hasPayment =
    !!(args.razorpayOrderId && args.razorpayPaymentId && args.razorpaySignature);

  if (!args.skipPayment && amountToCharge > 0) {
    if (!hasPayment) {
      return { ok: false as const, status: 400, error: "Payment required" };
    }
    if (
      !verifyRazorpaySignature(
        args.razorpayOrderId!,
        args.razorpayPaymentId!,
        args.razorpaySignature!
      )
    ) {
      return { ok: false as const, status: 400, error: "Invalid payment signature" };
    }
  }

  const { gstPercent, subtotalPaise, gstAmountPaise, totalPaise } = gstBreakdown(
    amountToCharge,
    newPlan.gst_percent
  );

  const now = new Date();
  const newExpiry = new Date(now);
  newExpiry.setDate(newExpiry.getDate() + DEFAULT_BILLING_DAYS);

  if (activeSub) {
    await sql`
      UPDATE merchant_subscriptions SET
        subscription_status = 'UPGRADED', is_active = false, updated_at = NOW()
      WHERE id = ${activeSub.id}
    `;
  }

  const ins = await sql`
    INSERT INTO merchant_subscriptions (
      merchant_id, store_id, plan_id, subscription_status, payment_status,
      start_date, expiry_date, is_active, auto_renew, upgraded_from, credit_applied,
      billing_start_at, billing_end_at, last_payment_date, next_billing_date
    ) VALUES (
      ${store.parent_id}, ${store.id}, ${newPlan.id}, 'ACTIVE', 'PAID',
      ${now.toISOString()}, ${newExpiry.toISOString()}, true, false,
      ${activeSub?.id ?? null}, ${creditApplied},
      ${now.toISOString()}, ${newExpiry.toISOString()},
      ${now.toISOString()}, ${newExpiry.toISOString()}
    )
    RETURNING id
  `;
  const newSubId = Number((ins[0] as { id: number }).id);

  await insertSubscriptionPayment(sql, {
    merchantId: store.parent_id,
    storeId: store.id,
    subscriptionId: newSubId,
    planId: newPlan.id,
    totalPaise,
    subtotalPaise,
    gstPercent,
    gstAmountPaise,
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
    razorpaySignature: args.razorpaySignature,
    gateway: hasPayment ? "RAZORPAY" : "PRORATION_CREDIT",
    gatewayId: hasPayment
      ? args.razorpayPaymentId!
      : `upgrade_${newSubId}_${now.getTime()}`,
    notes: creditApplied > 0 ? `Upgrade: ₹${creditApplied} credit applied` : "Plan upgrade",
    now,
    expiry: newExpiry,
  });

  return {
    ok: true as const,
    subscriptionId: newSubId,
    creditApplied,
    message: "Upgrade successful",
  };
}

async function insertSubscriptionPayment(
  sql: ReturnType<typeof getSql>,
  p: {
    merchantId: number;
    storeId: number;
    subscriptionId: number;
    planId: number;
    totalPaise: number;
    subtotalPaise: number;
    gstPercent: number;
    gstAmountPaise: number;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    razorpaySignature?: string;
    gateway: string;
    gatewayId: string;
    notes?: string;
    now: Date;
    expiry: Date;
  }
) {
  try {
    await sql`
      INSERT INTO subscription_payments (
        merchant_id, store_id, subscription_id, plan_id, amount,
        subtotal_paise, gst_percent_applied, gst_amount_paise, total_paise,
        payment_gateway, payment_gateway_id, payment_gateway_response,
        payment_status, payment_date, billing_period_start, billing_period_end, notes
      ) VALUES (
        ${p.merchantId}, ${p.storeId}, ${p.subscriptionId}, ${p.planId},
        ${Math.round(p.totalPaise) / 100},
        ${p.subtotalPaise}, ${p.gstPercent}, ${p.gstAmountPaise}, ${p.totalPaise},
        ${p.gateway}, ${p.gatewayId},
        ${JSON.stringify({
          razorpay_order_id: p.razorpayOrderId,
          razorpay_payment_id: p.razorpayPaymentId,
          razorpay_signature: p.razorpaySignature,
        })}::jsonb,
        'PAID', ${p.now.toISOString()}, ${p.now.toISOString()}, ${p.expiry.toISOString()},
        ${p.notes ?? null}
      )
    `;
  } catch {
    // subscription_payments table may be absent in some envs
  }
}
