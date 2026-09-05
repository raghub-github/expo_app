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
