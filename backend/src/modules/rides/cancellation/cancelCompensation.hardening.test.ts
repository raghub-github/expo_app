/**
 * Phase F hardening — settlement math concurrency / idempotency contracts.
 * Pure-function tests (no DB). Engine-level races rely on unique indexes.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { computeRideSettlement } from "../settlement/rideSettlement.math.js";
import { computeCancellationCompensation } from "./cancelCompensation.math.js";

test("parallel identical settlement inputs produce identical wallet deltas", () => {
  const input = {
    customerBill: 600,
    customerPaid: 600,
    paymentMode: "online" as const,
    platformPercentage: 20,
    riderPercentage: 80,
    components: {
      baseFare: 40,
      distanceFare: 400,
      platformFee: 25,
      taxTotal: 30,
      waitingCharge: 20,
      tollCharge: 40,
      tipAmount: 10,
    },
  };
  const results = Array.from({ length: 50 }, () => computeRideSettlement(input));
  for (let i = 1; i < results.length; i++) {
    assert.deepStrictEqual(results[i], results[0]);
  }
  // Toll + waiting + tip are rider pass-through; wallet credit = earnings.
  assert.equal(results[0]!.walletCredit, results[0]!.riderEarnings);
  assert.ok(results[0]!.riderEarnings > results[0]!.companyReceivable);
});

test("cash debit never equals full customer bill when company charges exist", () => {
  const res = computeRideSettlement({
    customerBill: 500,
    customerPaid: 500,
    paymentMode: "cash",
    platformPercentage: 25,
    riderPercentage: 75,
    components: {
      platformFee: 20,
      taxTotal: 20,
      convenienceFee: 5,
    },
  });
  assert.ok(res.walletDebit > 0);
  assert.ok(res.walletDebit < 500);
  assert.equal(res.walletDebit, res.companyReceivable);
  assert.equal(res.walletCredit, 0);
});

test("cancel compensation idempotent formula under repeated calls", () => {
  const input = {
    pickupKm: 4.5,
    waitingMinutes: 6,
    fareBase: 180,
    rule: {
      calcType: "PER_KM" as const,
      valueNumeric: 8,
      minCompensation: 20,
      maxCompensation: 100,
      includeWaitingCompensation: true,
      waitingCompensationPerMin: 1.5,
      payerMode: "SHARED" as const,
      customerSharePct: 70,
      companySharePct: 30,
    },
  };
  const a = computeCancellationCompensation(input);
  const b = computeCancellationCompensation(input);
  assert.deepStrictEqual(a, b);
  assert.equal(a.customerShare + a.companyShare, a.totalCompensation);
});
