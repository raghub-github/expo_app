import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { GatewayTruth } from "./payment/gateway-truth.js";

type Rec = { eventType: string; failureCode?: string | null };

function mocks(t: TestContext, opts: {
  truth?: GatewayTruth;
  intentRows?: Array<Record<string, unknown>>;
  sweepRows?: Array<Record<string, unknown>>;
}): { events: Rec[]; counters: { credit: number }; updates: string[] } {
  const events: Rec[] = [];
  const counters = { credit: 0 };
  const updates: string[] = [];

  const sqlFn = ((strings: TemplateStringsArray) => {
    const q = strings.join(" ");
    if (q.includes("FROM customer_wallet_topup_intents") && q.includes("pg_order_id =")) {
      return Promise.resolve(opts.intentRows ?? []);
    }
    if (q.includes("FROM customer_wallet_topup_intents") && q.includes("status IN")) {
      return Promise.resolve(opts.sweepRows ?? []);
    }
    if (q.includes("customer_wallet_credit")) {
      counters.credit += 1;
      return Promise.resolve([{ tx_id: 999 }]);
    }
    if (q.includes("UPDATE customer_wallet_topup_intents")) {
      updates.push(q);
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }) as unknown;

  t.mock.module("../db/client.js", { namedExports: { getSql: () => sqlFn, getDb: () => ({}) } });
  t.mock.module("./payment/gateway-truth.js", {
    namedExports: { resolveGatewayTruth: async () => opts.truth ?? { state: "NONE" } },
  });
  t.mock.module("../modules/orders/order.placement.service.js", {
    namedExports: { logPaymentEvent: async (_d: unknown, e: Rec) => { events.push({ eventType: e.eventType, failureCode: e.failureCode }); } },
  });
  return { events, counters, updates };
}

test("settle: PAID intent -> idempotent, no credit", async (t) => {
  const m = mocks(t, { intentRows: [{ id: 1, customer_id: 5, intent_id: "wti_x", amount: 100, status: "PAID" }] });
  const mod = await import(`./wallet-topup-payment.service.js?b=${Math.random()}`);
  const res = await mod.settleWalletTopupFromGateway({ razorpayOrderId: "o1", razorpayPaymentId: "p1" });
  assert.equal(res.ok, true);
  assert.equal(res.idempotent, true);
  assert.equal(m.counters.credit, 0);
});

test("settle: PAYMENT_PENDING intent -> credits once + marks PAID", async (t) => {
  const m = mocks(t, { intentRows: [{ id: 1, customer_id: 5, intent_id: "wti_x", amount: 100, status: "PAYMENT_PENDING" }] });
  const mod = await import(`./wallet-topup-payment.service.js?b=${Math.random()}`);
  const res = await mod.settleWalletTopupFromGateway({ razorpayOrderId: "o1", razorpayPaymentId: "p1" });
  assert.equal(res.ok, true);
  assert.equal(m.counters.credit, 1);
  assert.ok(m.updates.some((u) => u.includes("status = 'PAID'")));
});

test("settle: intent not found -> code INTENT_NOT_FOUND", async (t) => {
  mocks(t, { intentRows: [] });
  const mod = await import(`./wallet-topup-payment.service.js?b=${Math.random()}`);
  const res = await mod.settleWalletTopupFromGateway({ razorpayOrderId: "o1", razorpayPaymentId: "p1" });
  assert.equal(res.ok, false);
  assert.equal(res.code, "INTENT_NOT_FOUND");
});

test("reconcile CAPTURED -> settles", async (t) => {
  const m = mocks(t, {
    truth: { state: "CAPTURED", paymentId: "p1", paidPaise: 10000 },
    sweepRows: [{ id: 1, pg_order_id: "o1", amount: 100, status: "PAYMENT_PENDING" }],
    intentRows: [{ id: 1, customer_id: 5, intent_id: "wti_x", amount: 100, status: "PAYMENT_PENDING" }],
  });
  const mod = await import(`./wallet-topup-payment.service.js?b=${Math.random()}`);
  await mod.reconcileWalletTopups();
  assert.equal(m.counters.credit, 1);
  assert.ok(m.events.some((e) => e.eventType === "WALLET_TOPUP_RECONCILE_SETTLED"));
});

test("reconcile UNREACHABLE -> deferred, never failed, no credit", async (t) => {
  const m = mocks(t, {
    truth: { state: "UNREACHABLE", reason: "ETIMEDOUT" },
    sweepRows: [{ id: 1, pg_order_id: "o1", amount: 100, status: "PAYMENT_PENDING" }],
  });
  const mod = await import(`./wallet-topup-payment.service.js?b=${Math.random()}`);
  await mod.reconcileWalletTopups();
  assert.equal(m.counters.credit, 0);
  assert.ok(m.events.some((e) => e.eventType === "WALLET_TOPUP_RECONCILE_DEFERRED"));
  assert.ok(!m.events.some((e) => e.eventType === "WALLET_TOPUP_RECONCILE_FAILED"));
});

test("reconcile NONE -> marks intent failed", async (t) => {
  const m = mocks(t, {
    truth: { state: "NONE" },
    sweepRows: [{ id: 1, pg_order_id: "o1", amount: 100, status: "PAYMENT_PENDING" }],
  });
  const mod = await import(`./wallet-topup-payment.service.js?b=${Math.random()}`);
  await mod.reconcileWalletTopups();
  assert.equal(m.counters.credit, 0);
  assert.ok(m.updates.some((u) => u.includes("status = 'FAILED'")));
  assert.ok(m.events.some((e) => e.eventType === "WALLET_TOPUP_RECONCILE_FAILED"));
});
