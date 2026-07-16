/**
 * Merchant store subscription upgrades — Partner Site parity (Razorpay + proration).
 */

import { getSql } from "../../db/client.js";
import { getEnv } from "../../config/env.js";
import {
  createRazorpayOrder,
  verifyRazorpaySignature,
} from "../../services/payment/razorpayService.js";
import {
  buildPurchaseFromWalletIdempotencyKey,
  debitMerchantSubscriptionFee,
  isInsufficientMerchantWalletError,
} from "../../lib/merchant-subscription-wallet.js";
import { getWalletSummary } from "../../lib/merchant-wallet-engine.js";

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

  // Wallet balance is returned alongside the Razorpay order so the merchant app
  // can render "Pay with Wallet" as enabled/disabled without a second round-trip.
  // Errors are non-fatal — Razorpay path must not break if the wallet lookup fails.
  let walletAvailableBalance = 0;
  try {
    const summary = await getWalletSummary(store.id);
    walletAvailableBalance = Number((summary as { available_balance?: number }).available_balance ?? 0);
  } catch {
    walletAvailableBalance = 0;
  }

  if (amountToCharge <= 0) {
    return {
      ok: true as const,
      skipPayment: true,
      isUpgrade,
      creditApplied,
      amountToCharge: 0,
      plan: { id: plan.id, name: plan.plan_name, price: plan.price },
      walletAvailableBalance,
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
    walletAvailableBalance,
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

/**
 * Pay for a merchant subscription (new or upgrade) using the merchant's wallet
 * AVAILABLE balance. Mirrors verifyMerchantSubscriptionPayment + upgradeMerchantSubscription
 * but replaces Razorpay signature verification with an atomic wallet debit.
 *
 * Idempotency: the wallet-debit key is `merchant_sub_purchase_<store>_<plan>_<YYYYMMDD>`
 * (built by buildPurchaseFromWalletIdempotencyKey). A same-day retry (double-click,
 * network drop, backend restart) returns the same ledger row + associated subscription,
 * never charging twice. Repurchases on a later day get a fresh key.
 *
 * Failure semantics:
 *   - wallet_insufficient  → 402; no subscription written; ledger untouched
 *   - Race (balance drained between check and debit): subscription is marked
 *     PAYMENT_FAILED / is_active=false and 402 is returned. Idempotency key stays
 *     unclaimed so the merchant can retry after topping up (via earnings).
 */
export async function payMerchantSubscriptionFromWallet(args: {
  storeId: number;
  parentId: number;
  planId: number;
}) {
  const sql = getSql();

  const store = await loadStore(sql, args.storeId, args.parentId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };

  const plan = await loadPlan(sql, args.planId);
  if (!plan) return { ok: false as const, status: 404, error: "Plan not found" };
  if (plan.price <= 0) {
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
    if (currentPrice > plan.price) {
      return { ok: false as const, status: 400, error: "Downgrade not allowed" };
    }
  }

  const isUpgrade = !!(activeSub && activeSub.plan_id !== plan.id);
  const { amountToCharge, creditApplied } = computeUpgradeCharge(
    plan.price,
    activeSub,
    currentPrice
  );

  // Full-credit upgrade — nothing to debit; delegate to the existing free/skip path.
  if (amountToCharge <= 0) {
    return upgradeMerchantSubscription({
      storeId: args.storeId,
      parentId: args.parentId,
      newPlanId: args.planId,
      skipPayment: true,
    });
  }

  const idemKey = buildPurchaseFromWalletIdempotencyKey({
    storeId: store.id,
    planId: plan.id,
  });

  // Idempotency fast path — if we've already debited for this key today, return
  // the existing subscription. The ledger row's reference_id points at the
  // subscription row created on the original request.
  const priorLedger = await sql`
    SELECT id, reference_id
    FROM merchant_wallet_ledger
    WHERE idempotency_key = ${idemKey}
    LIMIT 1
  `;
  const priorLedgerRow = (priorLedger[0] as { id: number; reference_id: number } | undefined);
  if (priorLedgerRow) {
    const subRows = await sql`
      SELECT id, subscription_status, is_active, expiry_date
      FROM merchant_subscriptions
      WHERE id = ${priorLedgerRow.reference_id}
        AND merchant_id = ${store.parent_id}
        AND store_id = ${store.id}
      LIMIT 1
    `;
    const priorSub = subRows[0] as { id: number } | undefined;
    if (priorSub) {
      return {
        ok: true as const,
        subscriptionId: Number(priorSub.id),
        ledgerId: Number(priorLedgerRow.id),
        isUpgrade,
        creditApplied,
        idempotent: true,
        message: "Subscription already active (idempotent replay)",
      };
    }
  }

  // Fail fast on obviously insufficient balance — avoids writing an orphan
  // subscription row when the merchant clearly cannot pay. The atomic
  // merchant_wallet_debit() below is still the source of truth if a race occurs.
  let availableBefore = 0;
  try {
    const summary = await getWalletSummary(store.id);
    availableBefore = Number((summary as { available_balance?: number }).available_balance ?? 0);
  } catch {
    availableBefore = 0;
  }
  if (availableBefore + 0.001 < amountToCharge) {
    return {
      ok: false as const,
      status: 402,
      error: "wallet_insufficient",
      required: amountToCharge,
      available: availableBefore,
    };
  }

  const { gstPercent, subtotalPaise, gstAmountPaise, totalPaise } = gstBreakdown(
    amountToCharge,
    plan.gst_percent
  );

  const now = new Date();
  const expiry = computeNextBillingEnd(now, plan.billing_cycle);

  // Write the subscription row (new-purchase upsert OR upgrade insert).
  let subscriptionId: number;
  if (isUpgrade && activeSub) {
    await sql`
      UPDATE merchant_subscriptions SET
        subscription_status = 'UPGRADED', is_active = false, updated_at = NOW()
      WHERE id = ${activeSub.id}
    `;
    const ins = await sql`
      INSERT INTO merchant_subscriptions (
        merchant_id, store_id, plan_id, subscription_status, payment_status,
        start_date, expiry_date, is_active, auto_renew, upgraded_from, credit_applied,
        billing_start_at, billing_end_at, last_payment_date, next_billing_date
      ) VALUES (
        ${store.parent_id}, ${store.id}, ${plan.id}, 'ACTIVE', 'PAID',
        ${now.toISOString()}, ${expiry.toISOString()}, true, false,
        ${activeSub.id}, ${creditApplied},
        ${now.toISOString()}, ${expiry.toISOString()},
        ${now.toISOString()}, ${expiry.toISOString()}
      )
      RETURNING id
    `;
    subscriptionId = Number((ins[0] as { id: number }).id);
  } else {
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
  }

  // Atomic wallet debit. merchant_wallet_debit() is the only place that ever
  // decrements AVAILABLE — it uses SELECT FOR UPDATE + a re-check so races
  // between our balance read above and this call are safe.
  let ledgerId: number;
  try {
    const debit = await debitMerchantSubscriptionFee({
      storeId: store.id,
      subscriptionId,
      amount: amountToCharge,
      description: `Subscription: ${plan.plan_name}${isUpgrade ? " (upgrade)" : ""}`,
      metadata: {
        plan_id: plan.id,
        plan_name: plan.plan_name,
        billing_cycle: plan.billing_cycle,
        gst_percent: gstPercent,
        subtotal_paise: subtotalPaise,
        gst_amount_paise: gstAmountPaise,
        total_paise: totalPaise,
        is_upgrade: isUpgrade,
        credit_applied: creditApplied,
        source: "merchant_app_checkout",
      },
      idempotencySuffix: `${plan.id}_${isUpgrade ? "up" : "new"}`,
      idempotencyKeyOverride: idemKey,
    });
    ledgerId = debit.ledgerId;
  } catch (err) {
    if (isInsufficientMerchantWalletError(err)) {
      // Race: balance was drained after our pre-check. Roll the subscription
      // back to a non-active state so the merchant isn't left thinking they
      // paid. Do NOT delete the row — it may already be referenced by cascading
      // audit/notification writes on other paths.
      await sql`
        UPDATE merchant_subscriptions
        SET subscription_status = 'PAYMENT_FAILED',
            payment_status = 'FAILED',
            is_active = false,
            updated_at = NOW()
        WHERE id = ${subscriptionId}
      `;
      const summary = await getWalletSummary(store.id).catch(() => null);
      const available = summary
        ? Number((summary as { available_balance?: number }).available_balance ?? 0)
        : 0;
      return {
        ok: false as const,
        status: 402,
        error: "wallet_insufficient",
        required: amountToCharge,
        available,
      };
    }
    throw err;
  }

  // Record the payment. gateway="WALLET" tells downstream (reports, invoices,
  // admin dashboards) that the funds came from the merchant's wallet, not
  // Razorpay. gatewayId points at the ledger entry so financial auditing has
  // a hard link from the payment row into the append-only wallet ledger.
  await insertSubscriptionPayment(sql, {
    merchantId: store.parent_id,
    storeId: store.id,
    subscriptionId,
    planId: plan.id,
    totalPaise,
    subtotalPaise,
    gstPercent,
    gstAmountPaise,
    gateway: "WALLET",
    gatewayId: `wallet_ledger_${ledgerId}`,
    notes: isUpgrade
      ? `Wallet payment (upgrade)${creditApplied > 0 ? `, ₹${creditApplied} credit applied` : ""}`
      : "Wallet payment",
    now,
    expiry,
  });

  return {
    ok: true as const,
    subscriptionId,
    ledgerId,
    isUpgrade,
    creditApplied,
    idempotent: false,
    message: "Subscription activated via wallet",
  };
}

/**
 * Look up the merchant-subscription payment row that produced a given Razorpay
 * payment id. Used by both the webhook safety net (has this payment already
 * been activated?) and the refund path (fetch the record to refund).
 */
async function findSubscriptionPaymentByRazorpayId(
  sql: ReturnType<typeof getSql>,
  razorpayPaymentId: string
): Promise<{
  id: number;
  merchant_id: number;
  store_id: number;
  subscription_id: number;
  plan_id: number;
  total_paise: number;
  amount: number;
  payment_gateway: string;
  payment_status: string;
} | null> {
  const rows = await sql`
    SELECT id, merchant_id, store_id, subscription_id, plan_id,
           total_paise, amount, payment_gateway, payment_status
    FROM subscription_payments
    WHERE payment_gateway_id = ${razorpayPaymentId}
      AND payment_gateway = 'RAZORPAY'
    LIMIT 1
  `;
  const r = rows[0] as Record<string, unknown> | undefined;
  if (!r) return null;
  return {
    id: Number(r.id),
    merchant_id: Number(r.merchant_id),
    store_id: Number(r.store_id),
    subscription_id: Number(r.subscription_id),
    plan_id: Number(r.plan_id),
    total_paise: Number(r.total_paise ?? 0),
    amount: Number(r.amount ?? 0),
    payment_gateway: String(r.payment_gateway),
    payment_status: String(r.payment_status),
  };
}

/**
 * Business rule: subscription payments can only be refunded within
 * REFUND_WINDOW_DAYS of the payment date. Enforced server-side so a client
 * that removes the frontend guard still can't backdate a refund.
 *
 * Product decision (2026-07-17): 7 days. Adjust here for any future change.
 */
export const MERCHANT_SUBSCRIPTION_REFUND_WINDOW_DAYS = 7;
const MERCHANT_SUB_REFUND_WINDOW_MS =
  MERCHANT_SUBSCRIPTION_REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;

function isWithinRefundWindow(paymentDate: Date | string | null): { ok: boolean; deadline: Date | null; daysSince: number } {
  if (!paymentDate) return { ok: false, deadline: null, daysSince: Infinity };
  const paidAt = paymentDate instanceof Date ? paymentDate : new Date(String(paymentDate));
  if (Number.isNaN(paidAt.getTime())) return { ok: false, deadline: null, daysSince: Infinity };
  const deadline = new Date(paidAt.getTime() + MERCHANT_SUB_REFUND_WINDOW_MS);
  const daysSince = (Date.now() - paidAt.getTime()) / (24 * 60 * 60 * 1000);
  return { ok: Date.now() <= deadline.getTime(), deadline, daysSince };
}

/**
 * Webhook safety net — activate a merchant subscription from a Razorpay
 * `payment.captured` / `order.paid` event. Called ONLY when the payment's
 * notes carry `merchant_store_pk` + `plan_id` (which our
 * createMerchantSubscriptionPaymentOrder attaches). Fully idempotent:
 * if the payment row already exists (client already called verify-payment),
 * this is a no-op.
 *
 * This is critical for money-safety: if the merchant's app crashes, phone
 * dies, or network drops between "Razorpay captured payment" and
 * "client calls /verify-payment", the subscription would never activate
 * without this webhook fallback.
 */
export async function activateMerchantSubscriptionFromWebhook(args: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  notes: Record<string, unknown>;
}): Promise<
  | { ok: true; subscriptionId: number; idempotent: boolean }
  | { ok: false; code: string; message: string }
> {
  const sql = getSql();

  const merchantStorePk = Number(args.notes.merchant_store_pk ?? args.notes.merchantStorePk ?? 0);
  const planId = Number(args.notes.plan_id ?? args.notes.planId ?? 0);
  if (!merchantStorePk || !planId) {
    return { ok: false, code: "MISSING_NOTES", message: "notes.merchant_store_pk / plan_id absent" };
  }

  // Idempotent — if the client already ran verify-payment, this row exists and
  // we do nothing. Uses payment_gateway_id (= razorpay_payment_id) which is
  // effectively unique per successful Razorpay payment.
  const existing = await findSubscriptionPaymentByRazorpayId(sql, args.razorpayPaymentId);
  if (existing) {
    return { ok: true, subscriptionId: existing.subscription_id, idempotent: true };
  }

  // Resolve parent from the store — notes carry only store_id, not merchant_id.
  const parentRows = await sql`
    SELECT parent_id FROM merchant_stores WHERE id = ${merchantStorePk} LIMIT 1
  `;
  const parentId = Number((parentRows[0] as { parent_id?: number } | undefined)?.parent_id ?? 0);
  if (!parentId) return { ok: false, code: "STORE_NOT_FOUND", message: "Unknown store" };

  // Reuse verifyMerchantSubscriptionPayment. It re-verifies the signature but
  // since webhooks don't carry a signature we synthesize one using the same
  // HMAC the client would compute. Cleaner alternative: refactor verifyMerchant
  // SubscriptionPayment to accept a "trusted" flag. Doing the HMAC here keeps
  // the change surface tiny and reuses the exact code path a real client hits.
  const env = getEnv();
  if (!env.RAZORPAY_KEY_SECRET) {
    return { ok: false, code: "GATEWAY_NOT_CONFIGURED", message: "Razorpay secret missing" };
  }
  const { createHmac } = await import("node:crypto");
  const synthesizedSignature = createHmac("sha256", env.RAZORPAY_KEY_SECRET)
    .update(`${args.razorpayOrderId}|${args.razorpayPaymentId}`)
    .digest("hex");

  const result = await verifyMerchantSubscriptionPayment({
    storeId: merchantStorePk,
    parentId,
    planId,
    razorpayOrderId: args.razorpayOrderId,
    razorpayPaymentId: args.razorpayPaymentId,
    razorpaySignature: synthesizedSignature,
  });
  if (!result.ok) {
    return { ok: false, code: "ACTIVATION_FAILED", message: result.error };
  }
  return { ok: true, subscriptionId: result.subscriptionId, idempotent: false };
}

/**
 * Admin-initiated refund + eager revoke for a merchant-subscription payment.
 *
 *   Wallet payments  → credit merchant_wallet AVAILABLE with a fresh idempotency
 *                       key, mark payment REFUNDED, revoke subscription.
 *   Razorpay payments → call Razorpay Refund API, mark payment REFUND_PENDING,
 *                       revoke subscription eagerly. The `refund.processed`
 *                       webhook later flips payment → REFUNDED idempotently.
 *
 * Revoke semantics (per product decision 2026-07-16):
 *   Full refund → subscription_status='REFUNDED', is_active=false, immediately.
 *   No grace period. Natural expiry also revokes (existing cron behavior).
 *   Downgrade to a previous paid plan is NOT done automatically — the merchant
 *   drops to Free until they subscribe again (simpler, auditable).
 *
 * Only admin / support / manager / super_admin roles can call this — enforced
 * at the route layer (see merchant-subscription.admin.routes.ts).
 */
/**
 * Best-effort actor identity enrichment for the refund audit row.
 * Looks up system_users by id (numeric X-Actor-Subject-Id from the dashboard
 * proxy) OR by supabase auth id / email fallback. Never throws — enrichment
 * is a nice-to-have; the refund audit row always writes with whatever we have.
 */
async function enrichRefundActor(args: {
  actorSubjectId: string;
  actorRole: string;
}): Promise<{
  system_user_id: number | null;
  email: string | null;
  name: string | null;
}> {
  const sql = getSql();
  const empty = { system_user_id: null, email: null, name: null };
  try {
    // Numeric string → system_users.id lookup (dashboard proxy path).
    if (/^\d+$/.test(args.actorSubjectId)) {
      const rows = await sql`
        SELECT id, email, full_name
        FROM system_users
        WHERE id = ${Number(args.actorSubjectId)}
        LIMIT 1
      `;
      const r = rows[0] as { id: number; email: string | null; full_name: string | null } | undefined;
      if (r) {
        return {
          system_user_id: Number(r.id),
          email: r.email ?? null,
          name: r.full_name ?? null,
        };
      }
    }
    // Non-numeric → likely a supabase auth uuid from a direct-admin JWT call.
    // We don't have a supabase→system_users mapping here in backend; return
    // what we have. Dashboard proxy is the primary path so this is rare.
    return empty;
  } catch {
    return empty;
  }
}

export async function refundMerchantSubscriptionPayment(args: {
  paymentId: number;
  actorSubjectId: string;
  actorRole: string;
  reason?: string;
}): Promise<
  | {
      ok: true;
      paymentId: number;
      subscriptionId: number;
      gateway: "WALLET" | "RAZORPAY";
      /** For wallet: the new credit ledger id. For razorpay: the Razorpay refund id. */
      refundReference: string;
      alreadyRefunded: boolean;
    }
  | { ok: false; status: number; error: string }
> {
  const sql = getSql();

  const rows = await sql`
    SELECT id, merchant_id, store_id, subscription_id, plan_id,
           total_paise, amount, payment_gateway, payment_gateway_id,
           payment_status, payment_date
    FROM subscription_payments
    WHERE id = ${args.paymentId}
    LIMIT 1
  `;
  const p = rows[0] as Record<string, unknown> | undefined;
  if (!p) return { ok: false, status: 404, error: "payment_not_found" };

  const gateway = String(p.payment_gateway).toUpperCase();
  if (gateway !== "WALLET" && gateway !== "RAZORPAY") {
    return { ok: false, status: 400, error: `refund_unsupported_for_gateway_${gateway}` };
  }

  // 7-day refund window — server-side enforcement so no client can bypass it.
  // Applies to both wallet + Razorpay. Idempotent replays of already-refunded
  // payments (below) still succeed regardless of window since no side effect.
  const paymentDate = p.payment_date as string | Date | null;
  const window = isWithinRefundWindow(paymentDate);
  const paymentStatus = String(p.payment_status).toUpperCase();
  if (!["REFUNDED", "REFUND_PENDING"].includes(paymentStatus) && !window.ok) {
    return {
      ok: false,
      status: 400,
      error: "refund_window_expired",
    };
  }
  if (paymentStatus === "REFUNDED") {
    // Idempotent — safe to call twice; return existing refund info.
    return {
      ok: true,
      paymentId: Number(p.id),
      subscriptionId: Number(p.subscription_id),
      gateway: gateway as "WALLET" | "RAZORPAY",
      refundReference: `already_refunded_${p.id}`,
      alreadyRefunded: true,
    };
  }
  if (paymentStatus === "REFUND_PENDING" && gateway === "RAZORPAY") {
    // Razorpay refund already initiated — don't double-file.
    return {
      ok: true,
      paymentId: Number(p.id),
      subscriptionId: Number(p.subscription_id),
      gateway: "RAZORPAY",
      refundReference: `pending_${p.id}`,
      alreadyRefunded: true,
    };
  }
  if (paymentStatus !== "PAID") {
    return { ok: false, status: 400, error: `payment_not_refundable_status_${paymentStatus}` };
  }

  const merchantId = Number(p.merchant_id);
  const storeId = Number(p.store_id);
  const subscriptionId = Number(p.subscription_id);
  const totalPaise = Number(p.total_paise ?? 0);
  const amountRupees =
    Number.isFinite(Number(p.amount)) && Number(p.amount) > 0
      ? Number(p.amount)
      : Math.round(totalPaise) / 100;
  if (amountRupees <= 0) {
    return { ok: false, status: 400, error: "refund_amount_zero" };
  }

  const refundIdempotencyKey = `merchant_sub_refund_${args.paymentId}`;
  let refundReference: string;

  if (gateway === "WALLET") {
    // Credit merchant_wallet AVAILABLE. Idempotent via the ledger unique key.
    // Metadata records who did the refund + the original payment/ledger link
    // for audit reconstruction.
    const [row] = await sql`
      SELECT id FROM merchant_wallet_ledger WHERE idempotency_key = ${refundIdempotencyKey} LIMIT 1
    `;
    if (row) {
      refundReference = String((row as { id: number }).id);
    } else {
      const wallet = await sql`
        SELECT id FROM merchant_wallet WHERE merchant_store_id = ${storeId} LIMIT 1
      `;
      const walletRow = wallet[0] as { id?: number } | undefined;
      if (!walletRow?.id) {
        return { ok: false, status: 500, error: "wallet_not_found" };
      }
      const inserted = await sql<{ ledger_id: number | null }[]>`
        SELECT merchant_wallet_credit(
          ${walletRow.id}::bigint,
          ${amountRupees}::numeric,
          'SUBSCRIPTION_FEE'::wallet_transaction_category,
          'AVAILABLE'::wallet_balance_type,
          'SUBSCRIPTION'::wallet_reference_type,
          ${subscriptionId}::bigint,
          ${refundIdempotencyKey}::text,
          ${`Refund: subscription payment #${args.paymentId}${args.reason ? ` — ${args.reason}` : ""}`}::text,
          ${JSON.stringify({
            entry_type: "subscription_refund",
            balance_impact: "credit",
            original_payment_id: args.paymentId,
            original_gateway: "WALLET",
            actor_role: args.actorRole,
            actor_subject_id: args.actorSubjectId,
            reason: args.reason ?? null,
          })}::jsonb
        ) AS ledger_id
      `;
      refundReference = String(inserted[0]?.ledger_id ?? "");
    }
  } else {
    // Razorpay — initiate refund via API. Failures throw; the payment row stays
    // in PAID state so the admin can retry after fixing the underlying cause
    // (e.g., insufficient MID balance).
    const { createRazorpayRefund } = await import("../../services/payment/razorpayService.js");
    try {
      const razorpayPaymentId = String(p.payment_gateway_id ?? "");
      if (!razorpayPaymentId) {
        return { ok: false, status: 500, error: "razorpay_payment_id_missing" };
      }
      const refund = await createRazorpayRefund({
        paymentId: razorpayPaymentId,
        amountPaise: totalPaise,
        receipt: refundIdempotencyKey,
        notes: {
          subscription_payment_id: String(args.paymentId),
          subscription_id: String(subscriptionId),
          store_id: String(storeId),
          actor_role: args.actorRole,
          actor_subject_id: args.actorSubjectId,
          ...(args.reason ? { reason: args.reason } : {}),
        },
      });
      refundReference = String(refund.id);
    } catch (err) {
      const msg = (err as Error)?.message ?? String(err);
      // Razorpay dedupes by receipt — if it's already been filed, they return
      // a specific error we can treat as "success, already refunded".
      if (/receipt has already been used/i.test(msg)) {
        return {
          ok: true,
          paymentId: args.paymentId,
          subscriptionId,
          gateway: "RAZORPAY",
          refundReference: `razorpay_duplicate_${args.paymentId}`,
          alreadyRefunded: true,
        };
      }
      return { ok: false, status: 502, error: `razorpay_refund_failed: ${msg}` };
    }
  }

  // Mark the payment row. Wallet refund is instant → REFUNDED.
  // Razorpay refund is async → REFUND_PENDING (webhook will flip to REFUNDED).
  const newPaymentStatus = gateway === "WALLET" ? "REFUNDED" : "REFUND_PENDING";
  await sql`
    UPDATE subscription_payments
    SET payment_status = ${newPaymentStatus},
        notes = COALESCE(notes, '') ||
                ${(args.reason ? `\nRefund reason: ${args.reason}` : `\nRefunded by ${args.actorRole}`)},
        payment_gateway_response = COALESCE(payment_gateway_response, '{}'::jsonb) || ${JSON.stringify({
          refund_reference: refundReference,
          refunded_at: new Date().toISOString(),
          refunded_by_role: args.actorRole,
          refunded_by_subject_id: args.actorSubjectId,
        })}::jsonb
    WHERE id = ${args.paymentId}
  `;

  // Eager revoke — subscription becomes REFUNDED + is_active=false right away.
  // Merchant loses paid features immediately. No grace period, no auto-downgrade
  // to previous plan.
  await sql`
    UPDATE merchant_subscriptions
    SET subscription_status = 'REFUNDED',
        payment_status = 'REFUNDED',
        is_active = false,
        auto_renew = false,
        updated_at = NOW()
    WHERE id = ${subscriptionId}
      AND merchant_id = ${merchantId}
      AND store_id = ${storeId}
  `;

  // Durable audit trail — one immutable row per refund (see migration 0420).
  // Captures actor identity at write time so historical rows are stable if
  // the agent user is later deleted or renamed. Merchant-facing endpoints
  // strip the actor_* columns; admin-facing endpoints return them.
  const actor = await enrichRefundActor({
    actorSubjectId: args.actorSubjectId,
    actorRole: args.actorRole,
  });
  const now = new Date();
  const status = gateway === "WALLET" ? "COMPLETED" : "PENDING";
  try {
    await sql`
      INSERT INTO merchant_subscription_refunds (
        payment_id, subscription_id, merchant_id, store_id, plan_id,
        gateway, amount, total_paise, currency,
        refund_reference, wallet_ledger_id, razorpay_refund_id, razorpay_payment_id,
        status, reason,
        actor_subject_id, actor_system_user_id, actor_email, actor_name, actor_role,
        initiated_at, completed_at
      ) VALUES (
        ${args.paymentId}, ${subscriptionId}, ${merchantId}, ${storeId}, ${Number(p.plan_id)},
        ${gateway}, ${amountRupees}, ${totalPaise}, 'INR',
        ${refundReference},
        ${gateway === "WALLET" ? Number(refundReference) || null : null},
        ${gateway === "RAZORPAY" ? refundReference : null},
        ${gateway === "RAZORPAY" ? String(p.payment_gateway_id ?? "") : null},
        ${status}, ${args.reason ?? `Refunded by ${args.actorRole}`},
        ${args.actorSubjectId}, ${actor.system_user_id}, ${actor.email}, ${actor.name}, ${args.actorRole},
        ${now.toISOString()},
        ${status === "COMPLETED" ? now.toISOString() : null}
      )
      ON CONFLICT (payment_id) DO NOTHING
    `;
  } catch (err) {
    // Audit insert failure MUST NOT break the refund — the wallet credit /
    // Razorpay refund + payment status update have already succeeded. Log
    // for ops to backfill. In practice this only fires on schema drift
    // (e.g. migration 0420 not applied on this environment).
    console.error("[merchant-sub] refund audit insert failed:", (err as Error)?.message ?? err);
  }

  return {
    ok: true,
    paymentId: args.paymentId,
    subscriptionId,
    gateway: gateway as "WALLET" | "RAZORPAY",
    refundReference,
    alreadyRefunded: false,
  };
}

/**
 * Webhook: `refund.processed` for a merchant-subscription Razorpay payment.
 * The admin refund path already flipped payment → REFUND_PENDING and revoked
 * the subscription eagerly, so this is just the idempotent flip from
 * REFUND_PENDING → REFUNDED once Razorpay confirms the money reached the
 * customer's method. Never revokes a subscription that wasn't already
 * revoked here.
 */
export async function handleMerchantSubscriptionRefundWebhook(args: {
  razorpayPaymentId: string;
  razorpayRefundId: string;
}): Promise<{ ok: boolean; matched: boolean }> {
  const sql = getSql();
  const found = await findSubscriptionPaymentByRazorpayId(sql, args.razorpayPaymentId);
  if (!found) return { ok: true, matched: false };

  // Flip the audit row from PENDING → COMPLETED. Also stamp the razorpay
  // refund id in case the eager insert only had our internal reference.
  await sql`
    UPDATE merchant_subscription_refunds
    SET status = 'COMPLETED',
        completed_at = NOW(),
        razorpay_refund_id = COALESCE(razorpay_refund_id, ${args.razorpayRefundId}),
        razorpay_payment_id = COALESCE(razorpay_payment_id, ${args.razorpayPaymentId})
    WHERE payment_id = ${found.id}
      AND status = 'PENDING'
  `;

  await sql`
    UPDATE subscription_payments
    SET payment_status = 'REFUNDED',
        payment_gateway_response = COALESCE(payment_gateway_response, '{}'::jsonb) || ${JSON.stringify({
          razorpay_refund_id: args.razorpayRefundId,
          refund_confirmed_at: new Date().toISOString(),
          via: "razorpay_webhook",
        })}::jsonb
    WHERE id = ${found.id}
  `;
  // Ensure the subscription is revoked — usually already done by the admin
  // path but this is our safety net when a refund is initiated directly on
  // the Razorpay dashboard (no admin route call).
  await sql`
    UPDATE merchant_subscriptions
    SET subscription_status = 'REFUNDED',
        payment_status = 'REFUNDED',
        is_active = false,
        auto_renew = false,
        updated_at = NOW()
    WHERE id = ${found.subscription_id}
      AND subscription_status <> 'REFUNDED'
  `;
  return { ok: true, matched: true };
}

/**
 * Load merchant subscription refund history. Two projections:
 *   - forAdmin: includes actor_* columns (agent identity)
 *   - forMerchant: strips actor_* — merchant does not need to know which
 *     agent processed their refund, and exposing it is a privacy leak
 *
 * Scope filters (at least one required for merchant view; admin can query
 * all with none):
 *   - storeId
 *   - merchantId (parent, spans all stores under one owner)
 *   - paymentId (single-payment history — always <=1 row today)
 *
 * Ordered newest-first, paginated.
 */
type RefundRowRaw = {
  id: number;
  payment_id: number;
  subscription_id: number;
  merchant_id: number;
  store_id: number;
  plan_id: number | null;
  gateway: string;
  amount: string | number;
  total_paise: number;
  currency: string;
  refund_reference: string;
  wallet_ledger_id: number | null;
  razorpay_refund_id: string | null;
  razorpay_payment_id: string | null;
  status: string;
  reason: string;
  actor_subject_id: string;
  actor_system_user_id: number | null;
  actor_email: string | null;
  actor_name: string | null;
  actor_role: string;
  initiated_at: string;
  completed_at: string | null;
  failed_at: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
  store_name: string | null;
  store_public_id: string | null;
  plan_name: string | null;
  plan_code: string | null;
};

export type AdminRefundView = {
  id: number;
  paymentId: number;
  subscriptionId: number;
  merchantId: number;
  storeId: number;
  storePublicId: string | null;
  storeName: string | null;
  planId: number | null;
  planName: string | null;
  planCode: string | null;
  gateway: "WALLET" | "RAZORPAY";
  amount: number;
  totalPaise: number;
  currency: string;
  refundReference: string;
  walletLedgerId: number | null;
  razorpayRefundId: string | null;
  razorpayPaymentId: string | null;
  status: "PENDING" | "COMPLETED" | "FAILED";
  reason: string;
  actor: {
    subjectId: string;
    systemUserId: number | null;
    email: string | null;
    name: string | null;
    role: string;
  };
  initiatedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
};

export type MerchantRefundView = Omit<AdminRefundView, "actor">;

function mapRefundRow(raw: RefundRowRaw, includeActor: boolean): AdminRefundView | MerchantRefundView {
  const gateway = String(raw.gateway).toUpperCase() as "WALLET" | "RAZORPAY";
  const base: MerchantRefundView = {
    id: Number(raw.id),
    paymentId: Number(raw.payment_id),
    subscriptionId: Number(raw.subscription_id),
    merchantId: Number(raw.merchant_id),
    storeId: Number(raw.store_id),
    storePublicId: raw.store_public_id != null ? String(raw.store_public_id) : null,
    storeName: raw.store_name != null ? String(raw.store_name) : null,
    planId: raw.plan_id != null ? Number(raw.plan_id) : null,
    planName: raw.plan_name != null ? String(raw.plan_name) : null,
    planCode: raw.plan_code != null ? String(raw.plan_code) : null,
    gateway,
    amount: Number(raw.amount),
    totalPaise: Number(raw.total_paise),
    currency: String(raw.currency ?? "INR"),
    refundReference: String(raw.refund_reference),
    walletLedgerId: raw.wallet_ledger_id != null ? Number(raw.wallet_ledger_id) : null,
    razorpayRefundId: raw.razorpay_refund_id ?? null,
    razorpayPaymentId: raw.razorpay_payment_id ?? null,
    status: String(raw.status).toUpperCase() as "PENDING" | "COMPLETED" | "FAILED",
    reason: String(raw.reason),
    initiatedAt: String(raw.initiated_at),
    completedAt: raw.completed_at ? String(raw.completed_at) : null,
    failedAt: raw.failed_at ? String(raw.failed_at) : null,
    failureReason: raw.failure_reason ?? null,
  };
  if (!includeActor) return base;
  return {
    ...base,
    actor: {
      subjectId: String(raw.actor_subject_id),
      systemUserId: raw.actor_system_user_id != null ? Number(raw.actor_system_user_id) : null,
      email: raw.actor_email ?? null,
      name: raw.actor_name ?? null,
      role: String(raw.actor_role),
    },
  } as AdminRefundView;
}

export async function listMerchantSubscriptionRefunds(args: {
  storeId?: number;
  merchantId?: number;
  paymentId?: number;
  limit?: number;
  offset?: number;
  includeActor: boolean;
}): Promise<{
  items: (AdminRefundView | MerchantRefundView)[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}> {
  const sql = getSql();
  const limit = Math.min(200, Math.max(1, args.limit ?? 50));
  const offset = Math.max(0, args.offset ?? 0);

  const rows = await sql`
    SELECT
      r.*,
      s.store_id  AS store_public_id,
      s.store_name,
      p.plan_name,
      p.plan_code
    FROM merchant_subscription_refunds r
    LEFT JOIN merchant_stores s ON s.id = r.store_id
    LEFT JOIN merchant_plans  p ON p.id = r.plan_id
    WHERE 1 = 1
      ${args.storeId != null ? sql`AND r.store_id = ${args.storeId}` : sql``}
      ${args.merchantId != null ? sql`AND r.merchant_id = ${args.merchantId}` : sql``}
      ${args.paymentId != null ? sql`AND r.payment_id = ${args.paymentId}` : sql``}
    ORDER BY r.initiated_at DESC, r.id DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;

  const countRows = await sql`
    SELECT COUNT(*)::int AS total
    FROM merchant_subscription_refunds r
    WHERE 1 = 1
      ${args.storeId != null ? sql`AND r.store_id = ${args.storeId}` : sql``}
      ${args.merchantId != null ? sql`AND r.merchant_id = ${args.merchantId}` : sql``}
      ${args.paymentId != null ? sql`AND r.payment_id = ${args.paymentId}` : sql``}
  `;
  const total = Number((countRows[0] as { total?: number } | undefined)?.total ?? 0);

  const items = (rows as unknown as RefundRowRaw[]).map((r) => mapRefundRow(r, args.includeActor));
  return { items, total, limit, offset, hasMore: offset + items.length < total };
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

function computeNextBillingEnd(from: Date, billingCycle: string): Date {
  const end = new Date(from);
  const cycle = (billingCycle || "MONTHLY").toUpperCase();
  if (cycle === "YEARLY") {
    end.setFullYear(end.getFullYear() + 1);
  } else if (cycle === "QUARTERLY") {
    end.setMonth(end.getMonth() + 3);
  } else {
    end.setMonth(end.getMonth() + 1);
  }
  return end;
}

function parseDbDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

type MerchantSubRow = {
  id: number;
  merchant_id: number;
  store_id: number;
  plan_id: number;
  auto_renew: boolean;
  expiry_date: string | null;
  next_billing_date: string | null;
  billing_end_at: string | null;
  plan_name: string;
  price: number;
  gst_percent: number;
  billing_cycle: string;
};

async function loadDueAutoRenewSubscriptions(
  sql: ReturnType<typeof getSql>,
  storeIdFilter?: number
): Promise<MerchantSubRow[]> {
  const rows =
    storeIdFilter != null && storeIdFilter > 0
      ? await sql`
          SELECT
            ms.id,
            ms.merchant_id,
            ms.store_id,
            ms.plan_id,
            ms.auto_renew,
            ms.expiry_date,
            ms.next_billing_date,
            ms.billing_end_at,
            p.plan_name,
            p.price,
            p.gst_percent,
            p.billing_cycle
          FROM merchant_subscriptions ms
          JOIN merchant_plans p ON p.id = ms.plan_id
          WHERE ms.subscription_status = 'ACTIVE'
            AND ms.is_active = true
            AND ms.auto_renew = true
            AND ms.store_id = ${storeIdFilter}
            AND p.price > 0
            AND COALESCE(ms.next_billing_date, ms.expiry_date, ms.billing_end_at) <= NOW()
        `
      : await sql`
          SELECT
            ms.id,
            ms.merchant_id,
            ms.store_id,
            ms.plan_id,
            ms.auto_renew,
            ms.expiry_date,
            ms.next_billing_date,
            ms.billing_end_at,
            p.plan_name,
            p.price,
            p.gst_percent,
            p.billing_cycle
          FROM merchant_subscriptions ms
          JOIN merchant_plans p ON p.id = ms.plan_id
          WHERE ms.subscription_status = 'ACTIVE'
            AND ms.is_active = true
            AND ms.auto_renew = true
            AND p.price > 0
            AND COALESCE(ms.next_billing_date, ms.expiry_date, ms.billing_end_at) <= NOW()
        `;
  return (Array.isArray(rows) ? rows : []).map((raw) => {
    const r = raw as Record<string, unknown>;
    return {
      id: Number(r.id),
      merchant_id: Number(r.merchant_id),
      store_id: Number(r.store_id),
      plan_id: Number(r.plan_id),
      auto_renew: Boolean(r.auto_renew),
      expiry_date: r.expiry_date != null ? String(r.expiry_date) : null,
      next_billing_date: r.next_billing_date != null ? String(r.next_billing_date) : null,
      billing_end_at: r.billing_end_at != null ? String(r.billing_end_at) : null,
      plan_name: String(r.plan_name ?? "Subscription"),
      price: Number(r.price ?? 0),
      gst_percent: r.gst_percent != null ? Number(r.gst_percent) : 0,
      billing_cycle: String(r.billing_cycle ?? "MONTHLY"),
    };
  });
}

export async function getMerchantStoreSubscription(args: {
  storeId: number;
  parentId: number;
}) {
  const sql = getSql();
  const store = await loadStore(sql, args.storeId, args.parentId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };

  const rows = await sql`
    SELECT
      ms.id,
      ms.plan_id,
      ms.subscription_status,
      ms.payment_status,
      ms.auto_renew,
      ms.start_date,
      ms.expiry_date,
      ms.next_billing_date,
      ms.last_payment_date,
      p.plan_name,
      p.plan_code,
      p.price,
      p.gst_percent,
      p.billing_cycle
    FROM merchant_subscriptions ms
    JOIN merchant_plans p ON p.id = ms.plan_id
    WHERE ms.merchant_id = ${store.parent_id}
      AND ms.store_id = ${store.id}
      AND ms.subscription_status = 'ACTIVE'
      AND ms.is_active = true
      AND COALESCE(ms.billing_end_at, ms.expiry_date) >= NOW()
    ORDER BY ms.created_at DESC
    LIMIT 1
  `;
  const row = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  if (!row) {
    return { ok: true as const, active: false, subscription: null, plan: null };
  }

  return {
    ok: true as const,
    active: true,
    subscription: {
      id: Number(row.id),
      autoRenew: Boolean(row.auto_renew),
      subscriptionStatus: String(row.subscription_status ?? "ACTIVE"),
      paymentStatus: String(row.payment_status ?? "PAID"),
      startDate: row.start_date != null ? String(row.start_date) : null,
      expiryDate: row.expiry_date != null ? String(row.expiry_date) : null,
      nextBillingDate: row.next_billing_date != null ? String(row.next_billing_date) : null,
      lastPaymentDate: row.last_payment_date != null ? String(row.last_payment_date) : null,
    },
    plan: {
      id: Number(row.plan_id),
      planName: String(row.plan_name ?? ""),
      planCode: String(row.plan_code ?? ""),
      price: Number(row.price ?? 0),
      gstPercent: row.gst_percent != null ? Number(row.gst_percent) : 0,
      billingCycle: String(row.billing_cycle ?? "MONTHLY"),
    },
  };
}

export async function updateMerchantSubscriptionAutoRenew(args: {
  storeId: number;
  parentId: number;
  autoRenew: boolean;
  actorUserId?: string | null;
}) {
  const sql = getSql();
  const store = await loadStore(sql, args.storeId, args.parentId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };

  const rows = await sql`
    SELECT
      id,
      auto_renew,
      next_billing_date,
      expiry_date,
      billing_end_at
    FROM merchant_subscriptions
    WHERE merchant_id = ${store.parent_id}
      AND store_id = ${store.id}
      AND subscription_status = 'ACTIVE'
      AND is_active = true
    ORDER BY created_at DESC
    LIMIT 1
  `;
  const sub = (Array.isArray(rows) ? rows[0] : null) as Record<string, unknown> | undefined;
  if (!sub) return { ok: false as const, status: 404, error: "No active subscription" };

  const subId = Number(sub.id);
  const wasAutoRenew = Boolean(sub.auto_renew);
  const billingAnchor =
    parseDbDate(sub.next_billing_date) ??
    parseDbDate(sub.billing_end_at) ??
    parseDbDate(sub.expiry_date);

  if (args.autoRenew && !billingAnchor) {
    return { ok: false as const, status: 400, error: "Cannot enable auto-renew without billing date" };
  }

  const nowIso = new Date().toISOString();
  const nextBillingIso = billingAnchor?.toISOString() ?? null;

  if (args.autoRenew) {
    await sql`
      UPDATE merchant_subscriptions SET
        auto_renew = true,
        next_billing_date = COALESCE(next_billing_date, ${nextBillingIso}),
        next_auto_pay_date = COALESCE(next_billing_date, ${nextBillingIso}),
        auto_pay_enabled_at = CASE WHEN ${!wasAutoRenew} THEN ${nowIso}::timestamptz ELSE auto_pay_enabled_at END,
        auto_pay_enabled_by = CASE WHEN ${!wasAutoRenew} THEN NULL ELSE auto_pay_enabled_by END,
        auto_pay_disabled_at = NULL,
        auto_pay_disabled_by = NULL,
        updated_at = NOW()
      WHERE id = ${subId}
    `;
  } else {
    await sql`
      UPDATE merchant_subscriptions SET
        auto_renew = false,
        next_auto_pay_date = NULL,
        auto_pay_disabled_at = CASE WHEN ${wasAutoRenew} THEN ${nowIso}::timestamptz ELSE auto_pay_disabled_at END,
        auto_pay_disabled_by = CASE WHEN ${wasAutoRenew} THEN NULL ELSE auto_pay_disabled_by END,
        updated_at = NOW()
      WHERE id = ${subId}
    `;
  }

  return {
    ok: true as const,
    autoRenew: args.autoRenew,
    nextBillingDate: nextBillingIso,
  };
}

export async function ensureMerchantSubscriptionRenewalDebited(storeId: number): Promise<void> {
  if (!Number.isFinite(storeId) || storeId <= 0) return;
  await processMerchantSubscriptionRenewals(storeId);
}

export async function processMerchantSubscriptionRenewals(
  storeIdFilter?: number
): Promise<{ processed: number; renewed: number; failed: number }> {
  const sql = getSql();
  const due = await loadDueAutoRenewSubscriptions(sql, storeIdFilter);

  let renewed = 0;
  let failed = 0;

  for (const sub of due) {
    if (!sub.store_id || sub.price <= 0) {
      failed += 1;
      continue;
    }

    const billingEnd =
      parseDbDate(sub.next_billing_date) ??
      parseDbDate(sub.billing_end_at) ??
      parseDbDate(sub.expiry_date) ??
      new Date();
    const idempotencySuffix = billingEnd.getTime();

    const { gstPercent, subtotalPaise, gstAmountPaise, totalPaise } = gstBreakdown(
      sub.price,
      sub.gst_percent
    );
    const totalAmount = totalPaise / 100;

    try {
      if (totalAmount > 0) {
        await debitMerchantSubscriptionFee({
          storeId: sub.store_id,
          subscriptionId: sub.id,
          amount: totalAmount,
          description: `Subscription fee debited — ${sub.plan_name}`,
          metadata: {
            subscriptionId: sub.id,
            planId: sub.plan_id,
            billingCycle: sub.billing_cycle,
            renewal: true,
            gateway: "WALLET",
          },
          idempotencySuffix,
        });
      }

      const renewedFrom = billingEnd.getTime() <= Date.now() ? billingEnd : new Date();
      const newExpiry = computeNextBillingEnd(renewedFrom, sub.billing_cycle);
      const now = new Date();

      await sql`
        UPDATE merchant_subscriptions SET
          subscription_status = 'ACTIVE',
          payment_status = 'PAID',
          is_active = true,
          start_date = ${renewedFrom.toISOString()},
          expiry_date = ${newExpiry.toISOString()},
          billing_start_at = ${renewedFrom.toISOString()},
          billing_end_at = ${newExpiry.toISOString()},
          last_payment_date = ${now.toISOString()},
          next_billing_date = ${newExpiry.toISOString()},
          next_auto_pay_date = ${newExpiry.toISOString()},
          auto_pay_failure_count = 0,
          last_auto_pay_attempt = ${now.toISOString()},
          updated_at = NOW()
        WHERE id = ${sub.id}
      `;

      await insertSubscriptionPayment(sql, {
        merchantId: sub.merchant_id,
        storeId: sub.store_id,
        subscriptionId: sub.id,
        planId: sub.plan_id,
        totalPaise,
        subtotalPaise,
        gstPercent,
        gstAmountPaise,
        gateway: "WALLET",
        gatewayId: `wallet_renew_${sub.id}_${idempotencySuffix}`,
        notes: `Auto-renew from wallet — ${sub.plan_name}`,
        now,
        expiry: newExpiry,
      });

      renewed += 1;
    } catch (err) {
      console.warn("[merchant_subscription_renewal]", sub.id, (err as Error).message);
      const now = new Date();
      if (isInsufficientMerchantWalletError(err)) {
        await sql`
          UPDATE merchant_subscriptions SET
            subscription_status = 'EXPIRED',
            is_active = false,
            payment_status = 'FAILED',
            last_auto_pay_attempt = ${now.toISOString()},
            auto_pay_failure_count = COALESCE(auto_pay_failure_count, 0) + 1,
            updated_at = NOW()
          WHERE id = ${sub.id}
        `;
      } else {
        await sql`
          UPDATE merchant_subscriptions SET
            last_auto_pay_attempt = ${now.toISOString()},
            auto_pay_failure_count = COALESCE(auto_pay_failure_count, 0) + 1,
            updated_at = NOW()
          WHERE id = ${sub.id}
        `;
      }
      failed += 1;
    }
  }

  return { processed: due.length, renewed, failed };
}
