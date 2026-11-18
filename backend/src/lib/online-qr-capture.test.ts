import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";

type Row = Record<string, unknown>;

/**
 * finalizeQrFromCapturedPaymentWebhook with the DB and Razorpay stubbed: a QR
 * payment.captured webhook carries no QR id, so the payment must be matched to
 * the QR it was actually made on — via Razorpay's own list for each QR.
 */
function setup(
  t: TestContext,
  opts: {
    rows: Row[];
    qrPayments: Record<string, Array<{ id: string; amount: number; status: string }>>;
  }
) {
  const finalized: Array<{ source: string; qrId: string; paymentId: string }> = [];
  const sqlFn = async () => opts.rows;
  t.mock.module("../db/client.js", { namedExports: { getSql: () => sqlFn, getDb: () => ({}) } });
  t.mock.module("../config/env.js", {
    namedExports: { getEnv: () => ({ RAZORPAY_KEY_ID: "k", RAZORPAY_KEY_SECRET: "s" }) },
  });
  t.mock.module("../services/payment/razorpayService.js", {
    namedExports: {
      fetchRazorpayQrPayments: async (qrId: string) => opts.qrPayments[qrId] ?? [],
      closeRazorpayQrCode: async () => true,
    },
  });
  t.mock.module("../modules/rides/ride-online-qr.service.js", {
    namedExports: {
      finalizeRideOnlineQrPayment: async (i: { qrId: string; razorpayPaymentId: string }) => {
        finalized.push({ source: "ride", qrId: i.qrId, paymentId: i.razorpayPaymentId });
        return { ok: true, alreadyDone: false, orderId: "GM1", amountPaid: 58.28 };
      },
    },
  });
  t.mock.module("../modules/parcel/parcel-online-qr.service.js", {
    namedExports: {
      finalizeParcelOnlineQrPayment: async (i: { qrId: string; razorpayPaymentId: string }) => {
        finalized.push({ source: "parcel", qrId: i.qrId, paymentId: i.razorpayPaymentId });
        return { ok: true, alreadyDone: false, orderId: "GM2", amountPaid: 108.32 };
      },
    },
  });
  return { finalized };
}

const qrRow = (id: string, status = "INITIATED") => ({
  id: 1,
  transaction_id: id,
  payment_status: status,
  payment_gateway: "razorpay",
  amount: "58.28",
  gateway_response: { source: "ride_online_qr" },
  created_at: new Date(),
});

test("purpose → QR source", async (t) => {
  setup(t, { rows: [], qrPayments: {} });
  const { qrSourceForPurpose } = await import(`./online-qr-capture.js?p=${Math.random()}`);
  assert.equal(qrSourceForPurpose("ride_fare_collect"), "ride_online_qr");
  assert.equal(qrSourceForPurpose("parcel_fare_collect"), "parcel_online_qr");
  assert.equal(qrSourceForPurpose("food_checkout"), null);
});

test("webhook capture is applied to the QR that lists it (not simply the newest one)", async (t) => {
  const m = setup(t, {
    rows: [qrRow("qr_new"), qrRow("qr_old", "EXPIRED")],
    qrPayments: { qr_new: [], qr_old: [{ id: "pay_1", amount: 5828, status: "captured" }] },
  });
  const mod = await import(`./online-qr-capture.js?a=${Math.random()}`);
  const res = await mod.finalizeQrFromCapturedPaymentWebhook({
    orderRef: "GM1",
    purpose: "ride_fare_collect",
    razorpayPaymentId: "pay_1",
  });
  assert.equal(res.qrId, "qr_old");
  assert.deepEqual(m.finalized, [{ source: "ride", qrId: "qr_old", paymentId: "pay_1" }]);
});

test("a capture not yet listed on any QR is a retryable 5xx (Razorpay redelivers)", async (t) => {
  setup(t, { rows: [qrRow("qr_a")], qrPayments: { qr_a: [] } });
  const mod = await import(`./online-qr-capture.js?b=${Math.random()}`);
  await assert.rejects(
    mod.finalizeQrFromCapturedPaymentWebhook({ orderRef: "GM1", purpose: "ride_fare_collect", razorpayPaymentId: "pay_x" }),
    (e: { statusCode?: number; code?: string }) => e.statusCode === 503 && e.code === "QR_PAYMENT_NOT_VISIBLE"
  );
});

test("an already-recorded payment short-circuits without finalizing again", async (t) => {
  const row = { ...qrRow("qr_p", "PAID"), gateway_response: { source: "ride_online_qr", razorpayPaymentId: "pay_9" } };
  const m = setup(t, { rows: [row], qrPayments: {} });
  const mod = await import(`./online-qr-capture.js?c=${Math.random()}`);
  const res = await mod.finalizeQrFromCapturedPaymentWebhook({
    orderRef: "GM1",
    purpose: "ride_fare_collect",
    razorpayPaymentId: "pay_9",
  });
  assert.equal(res.alreadyDone, true);
  assert.equal(m.finalized.length, 0);
});

test("a missing order ref is rejected as a 4xx (acked, not retried)", async (t) => {
  setup(t, { rows: [], qrPayments: {} });
  const mod = await import(`./online-qr-capture.js?d=${Math.random()}`);
  await assert.rejects(
    mod.finalizeQrFromCapturedPaymentWebhook({ orderRef: "", purpose: "ride_fare_collect", razorpayPaymentId: "pay_1" }),
    (e: { statusCode?: number }) => e.statusCode === 400
  );
});
