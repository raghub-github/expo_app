import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { GatewayTruth } from "./gateway-truth.js";

/**
 * Verifies the generic notes-anchored recovery: reconciler converges (captured
 * -> flow verify once; unreachable/pending -> defer; none -> fail), and the
 * webhook handler blocks an amount-mismatched capture before finalizing.
 */
type Rec = { eventType: string; failureCode?: string | null };

function commonMocks(t: TestContext, opts: {
  truth?: GatewayTruth;
  candidatePayload?: Record<string, unknown>;
  amountPaise?: number | null;
  anchorRows?: Array<{ amount_paise: number | null; payload: Record<string, unknown> | null }>;
  lastEventRows?: Array<{ event_type: string; created_at: string }>;
}): { events: Rec[]; verifyCalls: Record<string, unknown[]> } {
  const events: Rec[] = [];
  const verifyCalls: Record<string, unknown[]> = { customer: [], rider: [], dues: [] };

  const sqlFn = ((strings: TemplateStringsArray) => {
    const q = strings.join(" ");
    if (q.includes("PAYMENT_ATTEMPT_INITIATED") && q.includes("DISTINCT ON")) {
      return Promise.resolve([
        { razorpay_order_id: "order_anc_1", amount_paise: opts.amountPaise ?? 59900, payload: opts.candidatePayload ?? { flow: "customer_subscription", customer_id: "5", plan_id: "2", billing_cycle: "monthly" } },
      ]);
    }
    if (q.includes("PAYMENT_ATTEMPT_INITIATED") && q.includes("LIMIT 1")) {
      return Promise.resolve(opts.anchorRows ?? []);
    }
    if (q.includes("ANCHORED_PAYMENT_SETTLED")) {
      return Promise.resolve(opts.lastEventRows ?? []);
    }
    return Promise.resolve([]);
  }) as unknown;

  t.mock.module("../../db/client.js", { namedExports: { getSql: () => sqlFn, getDb: () => ({}) } });
  t.mock.module("../../config/env.js", { namedExports: { getEnv: () => ({ RAZORPAY_KEY_SECRET: "test_secret" }) } });
  t.mock.module("./gateway-truth.js", {
    namedExports: { resolveGatewayTruth: async () => opts.truth ?? { state: "NONE" }, classifyGatewayPayments: () => opts.truth },
  });
  t.mock.module("../../modules/orders/order.placement.service.js", {
    namedExports: { logPaymentEvent: async (_d: unknown, e: Rec) => { events.push({ eventType: e.eventType, failureCode: e.failureCode }); } },
  });
  t.mock.module("../../modules/subscription/customer-subscription.service.js", {
    namedExports: { verifyCustomerSubscriptionPayment: async (a: unknown) => { verifyCalls.customer.push(a); return { ok: true }; } },
  });
  t.mock.module("../../modules/rider/rider-subscription.service.js", {
    namedExports: { verifyRiderSubscriptionPayment: async (a: unknown) => { verifyCalls.rider.push(a); return { ok: true }; } },
  });
  t.mock.module("../rider-subscription-dues-payment.service.js", {
    namedExports: { verifyRiderSubscriptionDuesPayment: async (a: unknown) => { verifyCalls.dues.push(a); return { ok: true }; } },
  });
  return { events, verifyCalls };
}

test("reconciler CAPTURED -> customer-subscription verify once + SETTLED", async (t) => {
  const { events, verifyCalls } = commonMocks(t, { truth: { state: "CAPTURED", paymentId: "pay_a", paidPaise: 59900 } });
  const mod = await import(`./anchored-payment-recovery.js?b=${Math.random()}`);
  await mod.reconcileAnchoredPayments();
  assert.equal(verifyCalls.customer.length, 1);
  assert.deepEqual(verifyCalls.customer[0], {
    customerId: 5, planId: 2, billingCycle: "monthly",
    razorpayOrderId: "order_anc_1", razorpayPaymentId: "pay_a",
    razorpaySignature: (verifyCalls.customer[0] as { razorpaySignature: string }).razorpaySignature,
  });
  assert.ok(events.some((e) => e.eventType === "ANCHORED_PAYMENT_SETTLED"));
});

test("reconciler routes rider_subscription_dues_payment to dues verify", async (t) => {
  const { verifyCalls } = commonMocks(t, {
    truth: { state: "CAPTURED", paymentId: "pay_d", paidPaise: 5000 },
    candidatePayload: { flow: "rider_subscription_dues_payment", rider_id: "77" },
    amountPaise: 5000,
  });
  const mod = await import(`./anchored-payment-recovery.js?b=${Math.random()}`);
  await mod.reconcileAnchoredPayments();
  assert.equal(verifyCalls.dues.length, 1);
  assert.equal((verifyCalls.dues[0] as { riderId: number }).riderId, 77);
});

test("reconciler UNREACHABLE -> deferred, never failed", async (t) => {
  const { events, verifyCalls } = commonMocks(t, { truth: { state: "UNREACHABLE", reason: "ETIMEDOUT" } });
  const mod = await import(`./anchored-payment-recovery.js?b=${Math.random()}`);
  await mod.reconcileAnchoredPayments();
  assert.equal(verifyCalls.customer.length, 0);
  assert.ok(events.some((e) => e.eventType === "ANCHORED_PAYMENT_DEFERRED"));
  assert.ok(!events.some((e) => e.eventType === "ANCHORED_PAYMENT_FAILED"));
});

test("reconciler NONE -> terminal fail", async (t) => {
  const { events } = commonMocks(t, { truth: { state: "NONE" } });
  const mod = await import(`./anchored-payment-recovery.js?b=${Math.random()}`);
  await mod.reconcileAnchoredPayments();
  assert.ok(events.some((e) => e.eventType === "ANCHORED_PAYMENT_FAILED" && e.failureCode === "NO_CAPTURE"));
});

test("webhook amount mismatch -> reconciliation_required, no verify", async (t) => {
  const { events, verifyCalls } = commonMocks(t, {
    anchorRows: [{ amount_paise: 59900, payload: { flow: "customer_subscription", customer_id: "5", plan_id: "2", billing_cycle: "monthly" } }],
  });
  const mod = await import(`./anchored-payment-recovery.js?b=${Math.random()}`);
  const res = await mod.handleAnchoredPaymentCaptured({
    notesType: "customer_subscription",
    razorpayOrderId: "order_anc_1",
    razorpayPaymentId: "pay_bad",
    capturedPaise: 100, // != 59900
    notes: { type: "customer_subscription" },
    source: "webhook",
  });
  assert.equal(res.ok, false);
  assert.equal(res.code, "PAYMENT_AMOUNT_MISMATCH");
  assert.equal(verifyCalls.customer.length, 0);
  assert.ok(events.some((e) => e.eventType === "RECONCILIATION_REQUIRED"));
});

test("webhook correct amount -> dispatches verify", async (t) => {
  const { verifyCalls } = commonMocks(t, {
    anchorRows: [{ amount_paise: 59900, payload: { flow: "customer_subscription", customer_id: "5", plan_id: "2", billing_cycle: "monthly" } }],
  });
  const mod = await import(`./anchored-payment-recovery.js?b=${Math.random()}`);
  const res = await mod.handleAnchoredPaymentCaptured({
    notesType: "customer_subscription",
    razorpayOrderId: "order_anc_1",
    razorpayPaymentId: "pay_ok",
    capturedPaise: 59900,
    notes: { type: "customer_subscription" },
    source: "webhook",
  });
  assert.equal(res.ok, true);
  assert.equal(verifyCalls.customer.length, 1);
});
