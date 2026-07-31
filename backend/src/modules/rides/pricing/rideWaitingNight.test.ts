import test from "node:test";
import assert from "node:assert/strict";
import { computeWaitingCharge } from "./rideWaitingCharge.js";
import { computeNightCharge, isWithinNightWindow } from "./rideNightCharge.js";

test("waiting: free minutes then per-min charge", () => {
  // 5 min wait, 2 free → 3 chargeable * ₹2 = 6
  const res = computeWaitingCharge(5 * 60, {
    freeMinutes: 2,
    chargePerMin: 2,
  });
  assert.equal(res.chargeableMinutes, 3);
  assert.equal(res.capped, 6);
  assert.equal(res.customerShare, 6);
  assert.equal(res.companyShare, 0);
});

test("waiting: max charge caps the amount", () => {
  const res = computeWaitingCharge(60 * 60, {
    freeMinutes: 0,
    chargePerMin: 5,
    maxCharge: 20,
  });
  assert.equal(res.gross, 300);
  assert.equal(res.capped, 20);
});

test("waiting: SHARED funding splits customer/company", () => {
  const res = computeWaitingCharge(10 * 60, {
    freeMinutes: 0,
    chargePerMin: 2,
    fundingMode: "SHARED",
    customerSharePct: 50,
    companySharePct: 50,
  });
  assert.equal(res.capped, 20);
  assert.equal(res.customerShare, 10);
  assert.equal(res.companyShare, 10);
});

test("waiting: COMPANY_100 — customer share 0", () => {
  const res = computeWaitingCharge(10 * 60, {
    freeMinutes: 0,
    chargePerMin: 3,
    fundingMode: "COMPANY_100",
  });
  assert.equal(res.customerShare, 0);
  assert.equal(res.companyShare, 30);
});

test("night window overnight 22:00-06:00", () => {
  assert.equal(isWithinNightWindow(new Date("2026-01-01T23:00:00"), "22:00", "06:00"), true);
  assert.equal(isWithinNightWindow(new Date("2026-01-01T03:00:00"), "22:00", "06:00"), true);
  assert.equal(isWithinNightWindow(new Date("2026-01-01T12:00:00"), "22:00", "06:00"), false);
});

test("night FIXED customer-funded", () => {
  const res = computeNightCharge({
    at: new Date("2026-01-01T23:30:00"),
    tripKm: 10,
    baseAmount: 200,
    config: {
      startTime: "22:00",
      endTime: "06:00",
      calcType: "FIXED",
      valueNumeric: 25,
      fundingMode: "CUSTOMER_100",
    },
  });
  assert.equal(res.applicable, true);
  assert.equal(res.total, 25);
  assert.equal(res.customerShare, 25);
});

test("night PER_KM company-funded", () => {
  const res = computeNightCharge({
    at: new Date("2026-01-01T23:30:00"),
    tripKm: 8,
    baseAmount: 200,
    config: {
      startTime: "22:00",
      endTime: "06:00",
      calcType: "PER_KM",
      valueNumeric: 2.5,
      fundingMode: "COMPANY_100",
    },
  });
  assert.equal(res.total, 20);
  assert.equal(res.customerShare, 0);
  assert.equal(res.companyShare, 20);
});

test("night PERCENTAGE shared", () => {
  const res = computeNightCharge({
    at: new Date("2026-01-01T23:30:00"),
    tripKm: 8,
    baseAmount: 200,
    config: {
      startTime: "22:00",
      endTime: "06:00",
      calcType: "PERCENTAGE",
      valueNumeric: 10,
      fundingMode: "SHARED",
      customerSharePct: 60,
      companySharePct: 40,
    },
  });
  assert.equal(res.total, 20);
  assert.equal(res.customerShare, 12);
  assert.equal(res.companyShare, 8);
});

test("night outside window yields zero", () => {
  const res = computeNightCharge({
    at: new Date("2026-01-01T14:00:00"),
    tripKm: 10,
    baseAmount: 200,
    config: {
      startTime: "22:00",
      endTime: "06:00",
      calcType: "FIXED",
      valueNumeric: 25,
    },
  });
  assert.equal(res.applicable, false);
  assert.equal(res.total, 0);
});
