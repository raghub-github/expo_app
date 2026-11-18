import test from "node:test";
import assert from "node:assert/strict";
import { computeRideSettlement } from "./rideSettlement.math.js";
import { promiseFloorFromSnapshot } from "./rideSettlement.engine.js";

// Zero-fee components so the split is a clean percentage of the bill.
const zeroComponents = {
  baseFare: 100,
  distanceFare: 0,
  waitingCharge: 0,
  tollCharge: 0,
  platformFee: 0,
  convenienceFee: 0,
  serviceCharge: 0,
  gatewayFee: 0,
  taxTotal: 0,
  couponDiscount: 0,
  companyFundedDiscount: 0,
  tipAmount: 0,
};

// ---------------------------------------------------------------------------
// Acceptance promise floor — the rider is never paid less than the earning
// shown when they accepted; the company funds any gap (promotionSubsidy).
// ---------------------------------------------------------------------------
test("promise floor: math below the accepted earning → topped up, company-funded, wallet follows", () => {
  const cash = computeRideSettlement({
    customerBill: 100,
    customerPaid: 100,
    paymentMode: "cash",
    platformPercentage: 20,
    riderPercentage: 80,
    riderEarningsFloor: 90,
    components: zeroComponents,
  });
  assert.equal(cash.riderEarnings, 90);
  assert.equal(cash.promiseTopUp, 10);
  assert.equal(cash.promotionSubsidy, 10);
  assert.equal(cash.walletDebit, 10, "cash: W = R − C = 90 − 100 → debit 10");
  assert.equal(cash.walletCredit, 0);
  assert.equal(cash.companyReceivable, 10, "commission 20 − top-up 10");

  const online = computeRideSettlement({
    customerBill: 100,
    customerPaid: 100,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    riderEarningsFloor: 90,
    components: zeroComponents,
  });
  assert.equal(online.walletCredit, 90, "online: credit R");
});

test("promise floor: never lowers pay, never applies when absent or already met", () => {
  for (const floor of [undefined, null, 0, 50, 80]) {
    const res = computeRideSettlement({
      customerBill: 100,
      customerPaid: 100,
      paymentMode: "online",
      platformPercentage: 20,
      riderPercentage: 80,
      riderEarningsFloor: floor,
      components: zeroComponents,
    });
    assert.equal(res.riderEarnings, 80, `floor ${floor}`);
    assert.equal(res.promiseTopUp, 0);
  }
});

test("promise floor excludes the tip: a tip never eats into the promise", () => {
  const res = computeRideSettlement({
    customerBill: 110,
    customerPaid: 110,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    riderEarningsFloor: 85,
    components: { ...zeroComponents, tipAmount: 10 },
  });
  // math: base 100 → 80 + tip 10 = 90; ex-tip 80 < 85 → top-up 5 → 95
  assert.equal(res.riderEarnings, 95);
  assert.equal(res.promiseTopUp, 5);
});

test("free ride (customer pays ₹0 under an offer): rider still earns on the gross fare", () => {
  const res = computeRideSettlement({
    customerBill: 0,
    customerPaid: 0,
    paymentMode: "online",
    platformPercentage: 20,
    riderPercentage: 80,
    components: { ...zeroComponents, couponDiscount: 100 },
  });
  assert.equal(res.riderEarnings, 80);
  assert.equal(res.walletCredit, 80);
  assert.equal(res.promotionSubsidy, 80, "the company funds the whole earning");
});

test("cash W = R − C in all three directions", () => {
  const run = (bill: number) =>
    computeRideSettlement({
      customerBill: bill,
      customerPaid: bill,
      paymentMode: "cash",
      platformPercentage: 20,
      riderPercentage: 80,
      components: { ...zeroComponents, couponDiscount: Math.max(0, 100 - bill) },
    });
  const more = run(100); // C 100 > R 80 → debit 20
  assert.deepEqual([more.walletDebit, more.walletCredit], [20, 0]);
  const equal = run(80); // offer 20: C 80 = R 80 → nothing
  assert.deepEqual([equal.walletDebit, equal.walletCredit], [0, 0]);
  const less = run(30); // offer 70: C 30 < R 80 → credit 50
  assert.deepEqual([less.walletDebit, less.walletCredit], [0, 50]);
});

// ---------------------------------------------------------------------------
// Accept snapshot → floor
// ---------------------------------------------------------------------------
test("accept snapshot → promise floor (tip-exclusive total)", () => {
  assert.equal(promiseFloorFromSnapshot({ baseEarning: 41, waitingEarning: 0, surgeEarning: 5, totalEarning: 46 }), 46);
  assert.equal(promiseFloorFromSnapshot({ baseEarning: 44, waitingEarning: 0, surgeEarning: 0, totalEarning: 44 }), 44);
});

test("no snapshot / zero total → no floor", () => {
  assert.equal(promiseFloorFromSnapshot(null), null);
  assert.equal(promiseFloorFromSnapshot({ baseEarning: 0, waitingEarning: 0, surgeEarning: 0, totalEarning: 0 }), null);
});

test("a snapshot whose parts do not add up is not trusted (prod GM10000349: base 26, total 61)", () => {
  assert.equal(promiseFloorFromSnapshot({ baseEarning: 26, waitingEarning: 0, surgeEarning: 0, totalEarning: 61 }), null);
});
