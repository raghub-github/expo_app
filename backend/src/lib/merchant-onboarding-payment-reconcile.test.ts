import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import type { GatewayTruth } from "./payment/gateway-truth.js";

type Rec = { eventType: string; failureCode?: string | null };

function mocks(t: TestContext, opts: { truth: GatewayTruth; sweepRows?: Array<Record<string, unknown>> }): {
  events: Rec[];
  updates: string[];
} {
  const events: Rec[] = [];
  const updates: string[] = [];
  const sqlFn = ((strings: TemplateStringsArray) => {
    const q = strings.join(" ");
    if (q.includes("FROM merchant_onboarding_payments") && q.includes("lower(status) IN")) {
      return Promise.resolve(
        opts.sweepRows ?? [{ id: 1, razorpay_order_id: "order_mo_1", amount_paise: 59000, status: "created", merchant_store_id: 12 }],
      );
    }
    if (q.includes("UPDATE merchant_onboarding_payments")) {
      updates.push(q);
      return Promise.resolve([]);
    }
    return Promise.resolve([]);
  }) as unknown;

  t.mock.module("../db/client.js", { namedExports: { getSql: () => sqlFn, getDb: () => ({}) } });
  t.mock.module("./payment/gateway-truth.js", { namedExports: { resolveGatewayTruth: async () => opts.truth } });
  t.mock.module("../modules/orders/order.placement.service.js", {
    namedExports: { logPaymentEvent: async (_d: unknown, e: Rec) => { events.push({ eventType: e.eventType, failureCode: e.failureCode }); } },
  });
  return { events, updates };
}

test("CAPTURED -> flips row to captured (DB trigger activates plan)", async (t) => {
  const m = mocks(t, { truth: { state: "CAPTURED", paymentId: "pay_mo", paidPaise: 59000 } });
  const mod = await import(`./merchant-onboarding-payment-reconcile.service.js?b=${Math.random()}`);
  await mod.reconcileMerchantOnboardingPayments();
  assert.ok(m.updates.some((u) => u.includes("status = 'captured'")));
  assert.ok(m.events.some((e) => e.eventType === "MERCHANT_ONBOARDING_RECONCILE_CAPTURED"));
});

test("UNREACHABLE -> deferred, never failed, no update", async (t) => {
  const m = mocks(t, { truth: { state: "UNREACHABLE", reason: "ETIMEDOUT" } });
  const mod = await import(`./merchant-onboarding-payment-reconcile.service.js?b=${Math.random()}`);
  await mod.reconcileMerchantOnboardingPayments();
  assert.equal(m.updates.length, 0);
  assert.ok(m.events.some((e) => e.eventType === "MERCHANT_ONBOARDING_RECONCILE_DEFERRED"));
  assert.ok(!m.events.some((e) => e.eventType === "MERCHANT_ONBOARDING_RECONCILE_FAILED"));
});

test("AMOUNT_MISMATCH -> reconciliation_required, no capture", async (t) => {
  const m = mocks(t, { truth: { state: "AMOUNT_MISMATCH", paymentId: "pay_x", paidPaise: 100, expectedPaise: 59000 } });
  const mod = await import(`./merchant-onboarding-payment-reconcile.service.js?b=${Math.random()}`);
  await mod.reconcileMerchantOnboardingPayments();
  assert.ok(!m.updates.some((u) => u.includes("status = 'captured'")));
  assert.ok(m.events.some((e) => e.eventType === "RECONCILIATION_REQUIRED" && e.failureCode === "PAYMENT_AMOUNT_MISMATCH"));
});

test("NONE -> marks failed (gateway confirms no capture)", async (t) => {
  const m = mocks(t, { truth: { state: "NONE" } });
  const mod = await import(`./merchant-onboarding-payment-reconcile.service.js?b=${Math.random()}`);
  await mod.reconcileMerchantOnboardingPayments();
  assert.ok(m.updates.some((u) => u.includes("status = 'failed'")));
  assert.ok(m.events.some((e) => e.eventType === "MERCHANT_ONBOARDING_RECONCILE_FAILED"));
});
