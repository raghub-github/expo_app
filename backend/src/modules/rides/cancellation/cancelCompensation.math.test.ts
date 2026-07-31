import test from "node:test";
import assert from "node:assert/strict";
import { computeCancellationCompensation } from "./cancelCompensation.math.js";

test("FIXED compensation with waiting", () => {
  const res = computeCancellationCompensation({
    pickupKm: 3,
    waitingMinutes: 5,
    rule: {
      calcType: "FIXED",
      valueNumeric: 30,
      includeWaitingCompensation: true,
      waitingCompensationPerMin: 2,
      payerMode: "CUSTOMER_100",
    },
  });
  assert.equal(res.baseCompensation, 30);
  assert.equal(res.waitingCompensation, 10);
  assert.equal(res.totalCompensation, 40);
  assert.equal(res.customerShare, 40);
  assert.equal(res.companyShare, 0);
});

test("PER_KM with min/max clamps", () => {
  const res = computeCancellationCompensation({
    pickupKm: 10,
    waitingMinutes: 0,
    rule: {
      calcType: "PER_KM",
      valueNumeric: 5,
      minCompensation: 20,
      maxCompensation: 40,
      includeWaitingCompensation: false,
    },
  });
  // 10*5=50 → clamped to max 40
  assert.equal(res.totalCompensation, 40);
});

test("PERCENTAGE of fare base", () => {
  const res = computeCancellationCompensation({
    pickupKm: 0,
    fareBase: 200,
    waitingMinutes: 0,
    rule: {
      calcType: "PERCENTAGE",
      valueNumeric: 15,
      includeWaitingCompensation: false,
    },
  });
  assert.equal(res.totalCompensation, 30);
});

test("SHARED payer split", () => {
  const res = computeCancellationCompensation({
    pickupKm: 0,
    waitingMinutes: 0,
    rule: {
      calcType: "FIXED",
      valueNumeric: 100,
      includeWaitingCompensation: false,
      payerMode: "SHARED",
      customerSharePct: 60,
      companySharePct: 40,
    },
  });
  assert.equal(res.customerShare, 60);
  assert.equal(res.companyShare, 40);
});

test("COMPANY_100 — customer pays nothing", () => {
  const res = computeCancellationCompensation({
    pickupKm: 2,
    waitingMinutes: 3,
    rule: {
      calcType: "FIXED",
      valueNumeric: 50,
      waitingCompensationPerMin: 2,
      payerMode: "COMPANY_100",
    },
  });
  assert.equal(res.totalCompensation, 56);
  assert.equal(res.customerShare, 0);
  assert.equal(res.companyShare, 56);
});
