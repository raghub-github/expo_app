/**
 * GatiMitra Max gate for rider waiting earning: the customer/merchant are always
 * charged; the rider only receives waiting with an active Max subscription, else
 * the company retains it. Money is conserved — riderWaiting + companyRetained
 * always equals the computed waiting.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRiderWaitingEntitlement } from "./rider-waiting-entitlement.ts";

test("Max rider receives the full waiting charge", async () => {
  const e = await resolveRiderWaitingEntitlement({ computedRiderWaiting: 30, riderHasGmitraMax: true });
  assert.equal(e.riderWaiting, 30);
  assert.equal(e.companyRetainedWaiting, 0);
  assert.equal(e.gatedByMax, false);
  assert.equal(e.hasMax, true);
});

test("non-Max rider receives ₹0; company retains the full waiting charge", async () => {
  const e = await resolveRiderWaitingEntitlement({ computedRiderWaiting: 30, riderHasGmitraMax: false });
  assert.equal(e.riderWaiting, 0);
  assert.equal(e.companyRetainedWaiting, 30);
  assert.equal(e.gatedByMax, true);
  assert.equal(e.hasMax, false);
});

test("conservation: riderWaiting + companyRetained === computed, both membership states", async () => {
  for (const amount of [0, 1, 15, 30, 150]) {
    for (const hasMax of [true, false]) {
      const e = await resolveRiderWaitingEntitlement({ computedRiderWaiting: amount, riderHasGmitraMax: hasMax });
      assert.equal(e.riderWaiting + e.companyRetainedWaiting, Math.max(0, amount), `amount=${amount} max=${hasMax}`);
      assert.ok(e.riderWaiting >= 0 && e.companyRetainedWaiting >= 0);
    }
  }
});

test("zero/negative waiting is a no-op regardless of membership", async () => {
  const zero = await resolveRiderWaitingEntitlement({ computedRiderWaiting: 0, riderHasGmitraMax: false });
  assert.deepEqual(
    [zero.riderWaiting, zero.companyRetainedWaiting, zero.gatedByMax],
    [0, 0, false]
  );
  const neg = await resolveRiderWaitingEntitlement({ computedRiderWaiting: -5, riderHasGmitraMax: true });
  assert.equal(neg.riderWaiting, 0);
  assert.equal(neg.companyRetainedWaiting, 0);
});
