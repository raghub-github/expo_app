import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { GatewayTruth } from "./payment/gateway-truth.js";

/**
 * Drives reconcileRideFarePayments against mocked gateway truth + DB, asserting:
 * captured -> settle via canonical finalizer once; ride already paid -> skip;
 * pending/unreachable -> defer (never fail); amount mismatch -> reconciliation.
 */
type Recorded = { eventType: string; failureCode?: string | null };

async function runScenario(t: TestContext, opts: {
  truth: GatewayTruth;
  ridePaymentStatus?: string; // pending vs completed
  lastEventRows?: Array<{ event_type: string; created_at: string }>;
}): Promise<{ events: Recorded[]; finalizeCalls: unknown[] }> {
  const events: Recorded[] = [];
  const finalizeCalls: unknown[] = [];

  const sqlFn = ((strings: TemplateStringsArray) => {
    const q = strings.join(" ");
    if (q.includes("RIDE_FARE_PAYMENT_INITIATED") && q.includes("DISTINCT ON")) {
      return Promise.resolve([
        { razorpay_order_id: "order_ride_1", order_id: "GM10000280", amount_paise: 12000, payload: { customer_sub: "cust-abc" } },
      ]);
    }
    if (q.includes("FROM orders_core") && q.includes("payment_status")) {
      return Promise.resolve([{ payment_status: opts.ridePaymentStatus ?? "pending" }]);
    }
    if (q.includes("RIDE_FARE_RECONCILE_FAILED")) {
      return Promise.resolve(opts.lastEventRows ?? []);
    }
    return Promise.resolve([]);
  }) as unknown;

  t.mock.module("../db/client.js", {
    namedExports: { getSql: () => sqlFn, getDb: () => ({}) },
  });
  t.mock.module("./payment/gateway-truth.js", {
    namedExports: { resolveGatewayTruth: async () => opts.truth, classifyGatewayPayments: () => opts.truth },
  });
  t.mock.module("../modules/orders/order.placement.service.js", {
    namedExports: {
      logPaymentEvent: async (_db: unknown, e: Recorded) => {
        events.push({ eventType: e.eventType, failureCode: e.failureCode });
      },
    },
  });
  t.mock.module("./ride-rider-payout-snapshot.js", {
    namedExports: { isRideFarePaymentPending: (s: string | null) => String(s ?? "").toLowerCase() === "pending" },
  });
  t.mock.module("../modules/rides/ride-payment.service.js", {
    namedExports: {
      finalizeRideFarePaymentFromWebhook: async (a: unknown) => {
        finalizeCalls.push(a);
        return { ok: true, idempotent: false, amountPaid: 120 };
      },
    },
  });

  const mod = await import(`./ride-fare-payment-reconcile.service.js?bust=${Math.random()}`);
  await mod.reconcileRideFarePayments();
  return { events, finalizeCalls };
}

test("CAPTURED + ride still pending -> settles once via canonical finalizer", async (t) => {
  const { events, finalizeCalls } = await runScenario(t, {
    truth: { state: "CAPTURED", paymentId: "pay_ride_ok", paidPaise: 12000 },
  });
  assert.equal(finalizeCalls.length, 1);
  assert.deepEqual(finalizeCalls[0], {
    razorpayOrderId: "order_ride_1",
    razorpayPaymentId: "pay_ride_ok",
    amountPaise: 12000,
    notes: null,
    source: "reconciler",
  });
  assert.ok(events.some((e) => e.eventType === "GATEWAY_RECONCILIATION_FOUND_PAYMENT"));
  assert.ok(events.some((e) => e.eventType === "RIDE_FARE_RECONCILE_SETTLED"));
});

test("ride already paid -> skip, no finalize", async (t) => {
  const { events, finalizeCalls } = await runScenario(t, {
    truth: { state: "CAPTURED", paymentId: "pay_ride_ok", paidPaise: 12000 },
    ridePaymentStatus: "completed",
  });
  assert.equal(finalizeCalls.length, 0);
  assert.equal(events.length, 0);
});

test("UNREACHABLE -> deferred, never failed", async (t) => {
  const { events, finalizeCalls } = await runScenario(t, { truth: { state: "UNREACHABLE", reason: "ETIMEDOUT" } });
  assert.equal(finalizeCalls.length, 0);
  assert.ok(events.some((e) => e.eventType === "RIDE_FARE_RECONCILE_DEFERRED"));
  assert.ok(!events.some((e) => e.eventType === "RIDE_FARE_RECONCILE_FAILED"));
});

test("PENDING -> deferred, never failed", async (t) => {
  const { events, finalizeCalls } = await runScenario(t, { truth: { state: "PENDING" } });
  assert.equal(finalizeCalls.length, 0);
  assert.ok(events.some((e) => e.eventType === "RIDE_FARE_RECONCILE_DEFERRED"));
});

test("AMOUNT_MISMATCH -> reconciliation_required, no settle", async (t) => {
  const { events, finalizeCalls } = await runScenario(t, {
    truth: { state: "AMOUNT_MISMATCH", paymentId: "pay_x", paidPaise: 100, expectedPaise: 12000 },
  });
  assert.equal(finalizeCalls.length, 0);
  assert.ok(events.some((e) => e.eventType === "RECONCILIATION_REQUIRED" && e.failureCode === "PAYMENT_AMOUNT_MISMATCH"));
});

test("NONE -> terminal audit-failed", async (t) => {
  const { events, finalizeCalls } = await runScenario(t, { truth: { state: "NONE" } });
  assert.equal(finalizeCalls.length, 0);
  assert.ok(events.some((e) => e.eventType === "RIDE_FARE_RECONCILE_FAILED" && e.failureCode === "NO_CAPTURE"));
});

test("recently deferred -> skipped (no gateway re-check)", async (t) => {
  const { events, finalizeCalls } = await runScenario(t, {
    truth: { state: "CAPTURED", paymentId: "pay_ride_ok", paidPaise: 12000 },
    lastEventRows: [{ event_type: "RIDE_FARE_RECONCILE_DEFERRED", created_at: new Date().toISOString() }],
  });
  assert.equal(finalizeCalls.length, 0);
  assert.equal(events.length, 0);
});
