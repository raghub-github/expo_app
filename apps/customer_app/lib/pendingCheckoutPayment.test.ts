import { test, mock } from "node:test";
import assert from "node:assert/strict";

let store: Record<string, string> = {};
mock.module("@react-native-async-storage/async-storage", {
  defaultExport: {
    getItem: async (k: string) => (k in store ? store[k] : null),
    setItem: async (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: async (k: string) => {
      delete store[k];
    },
  },
});

async function load() {
  return import("./pendingCheckoutPayment");
}

test("parsePendingCheckoutPayment rejects corrupt / expired payloads", async () => {
  const { parsePendingCheckoutPayment, PENDING_CHECKOUT_MAX_AGE_MS } = await load();
  const now = 10_000_000;
  assert.equal(parsePendingCheckoutPayment(null, now), null);
  assert.equal(parsePendingCheckoutPayment({}, now), null);
  assert.equal(parsePendingCheckoutPayment({ pendingId: "  " }, now), null);
  assert.equal(
    parsePendingCheckoutPayment(
      { pendingId: "p1", savedAt: now - PENDING_CHECKOUT_MAX_AGE_MS - 1 },
      now
    ),
    null
  );
});

test("persist + peek round-trips a live pending payment", async () => {
  store = {};
  const { persistPendingCheckoutPayment, peekPendingCheckoutPayment } = await load();
  await persistPendingCheckoutPayment({
    pendingId: "pend_1",
    idempotencyKey: "chk_abc",
    merchantName: "Test Kitchen",
    amount: "149",
    method: "UPI",
  });
  const peeked = await peekPendingCheckoutPayment();
  assert.equal(peeked?.pendingId, "pend_1");
  assert.equal(peeked?.idempotencyKey, "chk_abc");
  assert.equal(peeked?.merchantName, "Test Kitchen");
});

test("clearPendingCheckoutPayment removes the resume token", async () => {
  store = {};
  const {
    persistPendingCheckoutPayment,
    peekPendingCheckoutPayment,
    clearPendingCheckoutPayment,
  } = await load();
  await persistPendingCheckoutPayment({ pendingId: "pend_2" });
  await clearPendingCheckoutPayment();
  assert.equal(await peekPendingCheckoutPayment(), null);
});

test("shouldResumePendingCheckoutConfirming only for in-flight payment states", async () => {
  const { shouldResumePendingCheckoutConfirming } = await load();
  assert.equal(shouldResumePendingCheckoutConfirming("created"), false);
  assert.equal(shouldResumePendingCheckoutConfirming("failed"), false);
  assert.equal(shouldResumePendingCheckoutConfirming("refunded"), false);
  assert.equal(shouldResumePendingCheckoutConfirming("pending_confirmation"), true);
  assert.equal(shouldResumePendingCheckoutConfirming("paid"), true);
  assert.equal(shouldResumePendingCheckoutConfirming("captured_unfinalized"), true);
});

test("canResumeConfirmingAfterColdStart requires attempt for pending_confirmation", async () => {
  const { canResumeConfirmingAfterColdStart } = await load();
  // Scenario A: opened checkout / QR / Razorpay sheet but never paid.
  assert.equal(
    canResumeConfirmingAfterColdStart({ paymentUiOpened: true }, "pending_confirmation"),
    false
  );
  assert.equal(
    canResumeConfirmingAfterColdStart({}, "pending_confirmation"),
    false
  );
  // Scenario B: genuine attempt recorded locally.
  assert.equal(
    canResumeConfirmingAfterColdStart(
      { paymentAttemptInitiated: true },
      "pending_confirmation"
    ),
    true
  );
  // Money already moved — resume even without local attempt flag (QR + kill).
  assert.equal(canResumeConfirmingAfterColdStart({}, "paid"), true);
  assert.equal(canResumeConfirmingAfterColdStart({}, "captured_unfinalized"), true);
  assert.equal(canResumeConfirmingAfterColdStart({}, "created"), false);
  assert.equal(canResumeConfirmingAfterColdStart({ paymentAttemptInitiated: true }, "failed"), false);
});

test("persist + peek round-trips paymentAttemptInitiated", async () => {
  store = {};
  const { persistPendingCheckoutPayment, peekPendingCheckoutPayment } = await load();
  await persistPendingCheckoutPayment({
    pendingId: "pend_attempt",
    paymentAttemptInitiated: true,
  });
  const peeked = await peekPendingCheckoutPayment();
  assert.equal(peeked?.paymentAttemptInitiated, true);
});
