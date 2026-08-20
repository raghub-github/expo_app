import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyReconcileAction } from "./rider-penalty-payment.service.js";

const ABANDON = 20 * 60 * 1000;

test("captured payment → settle with that payment id (the rescue case)", () => {
  const d = classifyReconcileAction({
    payments: [{ id: "pay_ok", status: "captured" }],
    ageMs: 5 * 60 * 1000,
  });
  assert.deepEqual(d, { action: "settle", paymentId: "pay_ok" });
});

test("captured wins even when other attempts failed", () => {
  const d = classifyReconcileAction({
    payments: [
      { id: "pay_fail", status: "failed" },
      { id: "pay_ok", status: "captured" },
    ],
    ageMs: ABANDON + 1000,
  });
  assert.deepEqual(d, { action: "settle", paymentId: "pay_ok" });
});

test("young order with no payments → pending (rider may still be paying)", () => {
  const d = classifyReconcileAction({ payments: [], ageMs: 60 * 1000 });
  assert.deepEqual(d, { action: "pending" });
});

test("authorized-but-not-captured stays pending regardless of age", () => {
  const d = classifyReconcileAction({
    payments: [{ id: "pay_auth", status: "authorized" }],
    ageMs: ABANDON + 5 * 60 * 1000,
  });
  assert.deepEqual(d, { action: "pending" });
});

test("old order, nothing captured/authorized → fail (abandoned)", () => {
  const d = classifyReconcileAction({
    payments: [{ id: "pay_fail", status: "failed" }],
    ageMs: ABANDON + 1000,
  });
  assert.deepEqual(d, { action: "fail" });
});

test("old order with zero payment attempts → fail", () => {
  const d = classifyReconcileAction({ payments: [], ageMs: ABANDON + 1 });
  assert.deepEqual(d, { action: "fail" });
});

test("boundary: exactly at the abandon window with no live payment → fail", () => {
  const d = classifyReconcileAction({ payments: [], ageMs: ABANDON });
  assert.deepEqual(d, { action: "fail" });
});
