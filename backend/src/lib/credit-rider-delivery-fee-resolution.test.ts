import assert from "node:assert/strict";
import { test } from "node:test";
import { readRideRiderPayoutSnapshot } from "./ride-rider-payout-snapshot.js";

/**
 * Regression guard for the "₹59 at completion but ₹26 in ledger" underpayment.
 *
 * The on-delivery credit resolves the rider's DELIVERY earning from the frozen
 * rider_payout_snapshot. Two rules this test pins:
 *   1. The delivery earning is base + waiting + surge — it EXCLUDES the tip (which is
 *      credited separately). Using `totalEarning - tip` underpaid whenever totalEarning
 *      already excluded the tip.
 *   2. Callers pass `deliveryFee: 0` as a "resolve it" sentinel, so resolution must run
 *      on <= 0 (not only on null) — otherwise basePool is 0 and only the company-funded
 *      pre-pickup allowance is credited.
 */

const deliveryEarningFromSnapshot = (billingSnapshot: unknown): number => {
  const snap = readRideRiderPayoutSnapshot(billingSnapshot);
  if (!snap || snap.totalEarning <= 0) return 0;
  return Math.round((snap.baseEarning + snap.waitingEarning + snap.surgeEarning) * 100) / 100;
};

test("delivery earning = base+waiting+surge and EXCLUDES tip (the GM10000280 case)", () => {
  const billingSnapshot = {
    tip_amount: 15,
    rider_payout_snapshot: {
      baseEarning: 59,
      waitingEarning: 0,
      surgeEarning: 0,
      totalEarning: 59, // note: excludes tip
      appliedSurges: [],
      snapshottedAt: "2026-08-20T14:17:06.295Z",
    },
  };
  const delivery = deliveryEarningFromSnapshot(billingSnapshot);
  assert.equal(delivery, 59); // NOT 44 (totalEarning - tip), NOT 0 (guard skipped)
});

test("delivery earning includes waiting + surge, still excludes tip", () => {
  const billingSnapshot = {
    tip_amount: 20,
    rider_payout_snapshot: {
      baseEarning: 40,
      waitingEarning: 6,
      surgeEarning: 10,
      totalEarning: 56,
      appliedSurges: [{ name: "rain", amount: 10 }],
      snapshottedAt: "2026-08-20T00:00:00.000Z",
    },
  };
  assert.equal(deliveryEarningFromSnapshot(billingSnapshot), 56); // 40+6+10, tip 20 not included
});

test("no snapshot → 0 (falls through to geo/core resolution downstream)", () => {
  assert.equal(deliveryEarningFromSnapshot({}), 0);
  assert.equal(deliveryEarningFromSnapshot(null), 0);
});
