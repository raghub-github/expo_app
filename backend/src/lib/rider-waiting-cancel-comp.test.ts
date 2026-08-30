import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveWaitingCancellationCompensation } from "./rider-waiting-cancel-comp.ts";

test("rider cancels after waiting → FIRST-MILE ONLY (no waiting, no fare)", () => {
  const r = resolveWaitingCancellationCompensation({
    outcome: "rider_cancel",
    prePickupAmount: 28,
    waitingAmount: 40, // earned-so-far, but NOT paid on cancel
    orderFareAmount: 55,
  });
  assert.equal(r.firstMile, 28);
  assert.equal(r.waiting, 0);
  assert.equal(r.fare, 0);
  assert.equal(r.total, 28);
  assert.equal(r.reason, "cancel_first_mile_only");
});

test("rider continues and order completes → first-mile + waiting + fare", () => {
  const r = resolveWaitingCancellationCompensation({
    outcome: "continue_completed",
    prePickupAmount: 28,
    waitingAmount: 40,
    orderFareAmount: 55,
  });
  assert.equal(r.firstMile, 28);
  assert.equal(r.waiting, 40);
  assert.equal(r.fare, 55);
  assert.equal(r.total, 123);
});

test("negative / missing amounts clamp to 0", () => {
  const r = resolveWaitingCancellationCompensation({
    outcome: "rider_cancel",
    prePickupAmount: -5,
    waitingAmount: 40,
    orderFareAmount: 55,
  });
  assert.equal(r.firstMile, 0);
  assert.equal(r.total, 0);
});

test("cancel never pays more than continue for the same order", () => {
  const inputs = { prePickupAmount: 30, waitingAmount: 50, orderFareAmount: 60 };
  const cancel = resolveWaitingCancellationCompensation({ outcome: "rider_cancel", ...inputs });
  const completed = resolveWaitingCancellationCompensation({ outcome: "continue_completed", ...inputs });
  assert.ok(cancel.total <= completed.total);
  assert.equal(cancel.total, 30);
  assert.equal(completed.total, 140);
});
