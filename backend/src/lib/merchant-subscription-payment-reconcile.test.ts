import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { GatewayTruth } from "./payment/gateway-truth.js";

/**
 * Drives reconcileMerchantSubscriptionPayments against mocked gateway truth +
 * DB, asserting the convergence rules: captured -> activate once; pending /
 * unreachable -> defer (never fail); amount mismatch -> reconciliation_required;
 * already-activated -> skip.
 */
type Recorded = { eventType: string; payload?: Record<string, unknown>; failureCode?: string | null };

async function runScenario(t: TestContext, opts: {
  truth: GatewayTruth;
  activatedRows?: Array<{ id: number }>;
  lastEventRows?: Array<{ event_type: string; created_at: string }>;
  candidate?: { razorpay_order_id: string; amount_paise: number | null; payload: Record<string, unknown> };
}): Promise<{ events: Recorded[]; activateCalls: unknown[] }> {
  const events: Recorded[] = [];
  const activateCalls: unknown[] = [];
  const candidate = opts.candidate ?? {
    razorpay_order_id: "order_sub_1",
    amount_paise: 59000,
    payload: { merchant_store_pk: 77, plan_id: 3 },
  };

  const sqlFn = ((strings: TemplateStringsArray) => {
    const q = strings.join(" ");
    if (q.includes("MERCHANT_SUB_PAYMENT_INITIATED") && q.includes("DISTINCT ON")) {
      return Promise.resolve([candidate]);
    }
    if (q.includes("FROM subscription_payments") && q.includes("payment_gateway_response")) {
      return Promise.resolve(opts.activatedRows ?? []);
    }
    if (q.includes("MERCHANT_SUB_RECONCILE_FAILED")) {
      return Promise.resolve(opts.lastEventRows ?? []);
    }
    return Promise.resolve([]);
  }) as unknown;

  t.mock.module("../db/client.js", {
    namedExports: { getSql: () => sqlFn, getDb: () => ({}) },
  });
  t.mock.module("./payment/gateway-truth.js", {
    namedExports: {
      resolveGatewayTruth: async () => opts.truth,
      classifyGatewayPayments: () => opts.truth,
    },
  });
  t.mock.module("../modules/orders/order.placement.service.js", {
    namedExports: {
      logPaymentEvent: async (_db: unknown, e: Recorded) => {
        events.push({ eventType: e.eventType, payload: e.payload, failureCode: e.failureCode });
      },
    },
  });
  t.mock.module("../modules/merchant-partner/merchant-subscription.service.js", {
    namedExports: {
      activateMerchantSubscriptionFromWebhook: async (a: unknown) => {
        activateCalls.push(a);
        return { ok: true, subscriptionId: 555, idempotent: false };
      },
    },
  });

  const mod = await import(`./merchant-subscription-payment-reconcile.service.js?bust=${Math.random()}`);
  await mod.reconcileMerchantSubscriptionPayments();
  return { events, activateCalls };
}

test("CAPTURED -> activates exactly once + logs found-payment", async (t) => {
  const { events, activateCalls } = await runScenario(t, {
    truth: { state: "CAPTURED", paymentId: "pay_ok", paidPaise: 59000 },
  });
  assert.equal(activateCalls.length, 1);
  assert.deepEqual(activateCalls[0], {
    razorpayOrderId: "order_sub_1",
    razorpayPaymentId: "pay_ok",
    notes: { merchant_store_pk: 77, plan_id: 3 },
  });
  assert.ok(events.some((e) => e.eventType === "GATEWAY_RECONCILIATION_FOUND_PAYMENT"));
  assert.ok(events.some((e) => e.eventType === "MERCHANT_SUB_RECONCILE_ACTIVATED"));
});

test("already activated (subscription_payments row exists) -> skip, no activate", async (t) => {
  const { events, activateCalls } = await runScenario(t, {
    truth: { state: "CAPTURED", paymentId: "pay_ok", paidPaise: 59000 },
    activatedRows: [{ id: 12 }],
  });
  assert.equal(activateCalls.length, 0);
  assert.equal(events.length, 0);
});

test("UNREACHABLE -> deferred, never failed", async (t) => {
  const { events, activateCalls } = await runScenario(t, {
    truth: { state: "UNREACHABLE", reason: "ETIMEDOUT" },
  });
  assert.equal(activateCalls.length, 0);
  assert.ok(events.some((e) => e.eventType === "MERCHANT_SUB_RECONCILE_DEFERRED"));
  assert.ok(!events.some((e) => e.eventType === "MERCHANT_SUB_RECONCILE_FAILED"));
});

test("PENDING -> deferred, never failed", async (t) => {
  const { events, activateCalls } = await runScenario(t, { truth: { state: "PENDING" } });
  assert.equal(activateCalls.length, 0);
  assert.ok(events.some((e) => e.eventType === "MERCHANT_SUB_RECONCILE_DEFERRED"));
  assert.ok(!events.some((e) => e.eventType === "MERCHANT_SUB_RECONCILE_FAILED"));
});

test("AMOUNT_MISMATCH -> reconciliation_required, no activation", async (t) => {
  const { events, activateCalls } = await runScenario(t, {
    truth: { state: "AMOUNT_MISMATCH", paymentId: "pay_x", paidPaise: 100, expectedPaise: 59000 },
  });
  assert.equal(activateCalls.length, 0);
  assert.ok(events.some((e) => e.eventType === "RECONCILIATION_REQUIRED" && e.failureCode === "PAYMENT_AMOUNT_MISMATCH"));
});

test("NONE -> terminal audit-failed (gateway confirms no capture)", async (t) => {
  const { events, activateCalls } = await runScenario(t, { truth: { state: "NONE" } });
  assert.equal(activateCalls.length, 0);
  assert.ok(events.some((e) => e.eventType === "MERCHANT_SUB_RECONCILE_FAILED" && e.failureCode === "NO_CAPTURE"));
});

test("recently deferred -> skipped (no gateway re-check)", async (t) => {
  const { events, activateCalls } = await runScenario(t, {
    truth: { state: "CAPTURED", paymentId: "pay_ok", paidPaise: 59000 },
    lastEventRows: [{ event_type: "MERCHANT_SUB_RECONCILE_DEFERRED", created_at: new Date().toISOString() }],
  });
  assert.equal(activateCalls.length, 0);
  assert.equal(events.length, 0);
});

test("terminal reconciliation_required -> not re-processed", async (t) => {
  const { events, activateCalls } = await runScenario(t, {
    truth: { state: "CAPTURED", paymentId: "pay_ok", paidPaise: 59000 },
    lastEventRows: [{ event_type: "RECONCILIATION_REQUIRED", created_at: new Date(0).toISOString() }],
  });
  assert.equal(activateCalls.length, 0);
  assert.equal(events.length, 0);
});
