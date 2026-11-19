import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";

/**
 * settleLateInAppFarePayment decisions with the DB and Razorpay stubbed:
 *   same payment → idempotent; proven foreign capture → refunded; unproven → never refunded.
 */
function setup(t: TestContext, opts: { paidBy?: string | null; anchored?: boolean }) {
  const refunds: Array<{ paymentId: string }> = [];
  const events: string[] = [];
  const sqlFn = async (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join("?");
    if (text.includes("FROM orders_core_payments") && text.includes("razorpayPaymentId")) {
      return opts.paidBy && values.includes(opts.paidBy) ? [{ ok: 1 }] : [];
    }
    if (text.includes("FROM payment_events")) return opts.anchored ? [{ ok: 1 }] : [];
    if (text.includes("INSERT INTO payment_events")) {
      events.push(String(values[0]));
      return [];
    }
    return [];
  };
  t.mock.module("../db/client.js", { namedExports: { getSql: () => sqlFn, getDb: () => ({}) } });
  t.mock.module("../services/payment/razorpayService.js", {
    namedExports: {
      createRazorpayRefund: async (p: { paymentId: string }) => {
        refunds.push(p);
        return { id: `rfnd_${p.paymentId}` };
      },
    },
  });
  return { refunds, events };
}

const base = { service: "person_ride" as const, orderIdText: "GM1", razorpayOrderId: "order_1", amountPaise: 5828 };

test("the payment that paid the ride, confirmed again → idempotent, no refund", async (t) => {
  const m = setup(t, { paidBy: "pay_1", anchored: true });
  const { settleLateInAppFarePayment } = await import(`./late-fare-capture.js?a=${Math.random()}`);
  const r = await settleLateInAppFarePayment({ ...base, razorpayPaymentId: "pay_1", signatureValid: true });
  assert.deepEqual(r, { samePayment: true, refunded: false });
  assert.equal(m.refunds.length, 0);
});

test("a proven second payment after the ride was paid (cash / QR) → refunded", async (t) => {
  const m = setup(t, { paidBy: null, anchored: true });
  const { settleLateInAppFarePayment } = await import(`./late-fare-capture.js?b=${Math.random()}`);
  const r = await settleLateInAppFarePayment({ ...base, razorpayPaymentId: "pay_2", signatureValid: true });
  assert.deepEqual(r, { samePayment: false, refunded: true });
  assert.deepEqual(m.refunds.map((x) => x.paymentId), ["pay_2"]);
  assert.ok(m.events.includes("INAPP_LATE_CAPTURE_REFUNDED"));
});

test("an invalid signature is never refunded (a forged id could refund someone else's payment)", async (t) => {
  const m = setup(t, { paidBy: null, anchored: true });
  const { settleLateInAppFarePayment } = await import(`./late-fare-capture.js?c=${Math.random()}`);
  const r = await settleLateInAppFarePayment({ ...base, razorpayPaymentId: "pay_x", signatureValid: false });
  assert.equal(r.refunded, false);
  assert.equal(m.refunds.length, 0);
  assert.ok(m.events.includes("INAPP_LATE_CAPTURE_NEEDS_REVIEW"));
});

test("a Razorpay order not created by this job's checkout is never refunded", async (t) => {
  const m = setup(t, { paidBy: null, anchored: false });
  const { settleLateInAppFarePayment } = await import(`./late-fare-capture.js?d=${Math.random()}`);
  const r = await settleLateInAppFarePayment({ ...base, razorpayPaymentId: "pay_y", signatureValid: true });
  assert.equal(r.refunded, false);
  assert.equal(m.refunds.length, 0);
});

test("GatiCash-only attempt (no Razorpay id) → nothing to refund", async (t) => {
  const m = setup(t, { paidBy: null, anchored: true });
  const { settleLateInAppFarePayment } = await import(`./late-fare-capture.js?e=${Math.random()}`);
  const r = await settleLateInAppFarePayment({ ...base, razorpayPaymentId: null, signatureValid: false });
  assert.deepEqual(r, { samePayment: false, refunded: false });
  assert.equal(m.refunds.length, 0);
});
