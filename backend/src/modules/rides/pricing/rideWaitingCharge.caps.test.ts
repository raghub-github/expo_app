import { test } from "node:test";
import assert from "node:assert/strict";
import { computeWaitingCharge, normalizeFundingShares } from "./rideWaitingCharge.ts";
import {
  calcWaitingCharge,
  WAITING_DEFAULT_MAX_MINUTES,
  WAITING_DEFAULT_MAX_CHARGE,
} from "@gatimitra/slab-pricing";

const SEC = (min: number) => min * 60;

// ---- Problem A: the ₹1,000 bug can no longer happen ----

test("null caps are bounded by the engine safety ceiling — never unbounded", () => {
  // 600 min wait at ₹2/min with NO configured caps. Old behavior: 600×2 = ₹1200.
  const r = computeWaitingCharge(SEC(600), { freeMinutes: 0, chargePerMin: 2 });
  assert.equal(r.gross, 1200); // raw is still reported for transparency…
  // …but the charge is clamped: min(45-min ceiling × 2, ₹150 ceiling) = min(90, 150) = 90.
  assert.equal(r.capped, 90);
  assert.ok(r.capped < 1000, "waiting can never reach ₹1000 with null caps");
  assert.equal(r.chargeableMinutes, WAITING_DEFAULT_MAX_MINUTES);
});

test("duration cap binds before amount cap", () => {
  // 45 min at ₹2/min, max 30 min, ₹1000 amount cap → 30×2 = ₹60 (duration cap wins).
  const r = computeWaitingCharge(SEC(45), {
    freeMinutes: 0,
    chargePerMin: 2,
    maxMinutes: 30,
    maxCharge: 1000,
  });
  assert.equal(r.chargeableMinutes, 30);
  assert.equal(r.capped, 60);
});

test("amount cap binds when rate is high", () => {
  // 45 min at ₹5/min, max 30 min, ₹60 amount cap → 30×5 = 150 → clamped to ₹60.
  const r = computeWaitingCharge(SEC(45), {
    freeMinutes: 0,
    chargePerMin: 5,
    maxMinutes: 30,
    maxCharge: 60,
  });
  assert.equal(r.capped, 60);
  assert.equal(r.gross, 225); // 45 × 5 raw, for transparency
});

test("the audit example — 45 min, ₹2/min, 30 min / ₹60 caps → exactly ₹60", () => {
  const r = computeWaitingCharge(SEC(45), {
    freeMinutes: 0,
    chargePerMin: 2,
    maxMinutes: 30,
    maxCharge: 60,
  });
  assert.equal(r.capped, 60);
});

test("free minutes are subtracted before the cap", () => {
  // 20 min wait, 10 free, ₹3/min, 30-min cap → (20-10)=10 billable × 3 = ₹30, under caps.
  const r = computeWaitingCharge(SEC(20), {
    freeMinutes: 10,
    chargePerMin: 3,
    maxMinutes: 30,
    maxCharge: 100,
  });
  assert.equal(r.chargeableMinutes, 10);
  assert.equal(r.capped, 30);
});

test("funding split applies to the CAPPED amount, not the gross", () => {
  // Gross would be huge; capped to ₹60; SHARED 50/50 → ₹30 customer / ₹30 company.
  const r = computeWaitingCharge(SEC(600), {
    freeMinutes: 0,
    chargePerMin: 5,
    maxMinutes: 30,
    maxCharge: 60,
    fundingMode: "SHARED",
    customerSharePct: 50,
    companySharePct: 50,
  });
  assert.equal(r.capped, 60);
  assert.equal(r.customerShare, 30);
  assert.equal(r.companyShare, 30);
});

test("company-funded food waiting charges the customer nothing", () => {
  const r = computeWaitingCharge(SEC(45), {
    freeMinutes: 0,
    chargePerMin: 2,
    maxMinutes: 30,
    maxCharge: 60,
    fundingMode: "COMPANY_100",
  });
  assert.equal(r.capped, 60);
  assert.equal(r.customerShare, 0);
  assert.equal(r.companyShare, 60);
});

// ---- shared primitive parity (rider-side uses this; A-3 fix) ----

test("calcWaitingCharge: configured caps", () => {
  assert.equal(calcWaitingCharge(45, 0, 2, 30, 60), 60); // duration→60, ≤ amount cap
  assert.equal(calcWaitingCharge(45, 0, 5, 30, 60), 60); // amount cap binds
  assert.equal(calcWaitingCharge(20, 10, 3, 30, 100), 30); // free subtracted
});

test("calcWaitingCharge: null caps fall back to the safety ceiling, never unbounded", () => {
  // 600 min at ₹2/min with no caps → min(45×2, 150) = 90, not 1200.
  assert.equal(calcWaitingCharge(600, 0, 2), 90);
  assert.ok(calcWaitingCharge(600, 0, 50) <= WAITING_DEFAULT_MAX_CHARGE);
});

// ---- Step 2: MERCHANT funding mode ----

test("MERCHANT_100 → whole capped charge is merchant-funded; customer + company pay nothing", () => {
  const r = computeWaitingCharge(SEC(45), {
    freeMinutes: 0,
    chargePerMin: 2,
    maxMinutes: 30,
    maxCharge: 60,
    fundingMode: "MERCHANT_100",
  });
  assert.equal(r.capped, 60);
  assert.equal(r.merchantShare, 60);
  assert.equal(r.customerShare, 0);
  assert.equal(r.companyShare, 0);
});

test("normalizeFundingShares handles all four modes", () => {
  assert.deepEqual(normalizeFundingShares("MERCHANT_100", null, null), {
    mode: "MERCHANT_100",
    customerPct: 0,
    companyPct: 0,
    merchantPct: 100,
  });
  assert.deepEqual(normalizeFundingShares("COMPANY_100", null, null), {
    mode: "COMPANY_100",
    customerPct: 0,
    companyPct: 100,
    merchantPct: 0,
  });
  assert.deepEqual(normalizeFundingShares("CUSTOMER_100", null, null), {
    mode: "CUSTOMER_100",
    customerPct: 100,
    companyPct: 0,
    merchantPct: 0,
  });
  const shared = normalizeFundingShares("SHARED", 70, 30);
  assert.equal(shared.mode, "SHARED");
  assert.equal(shared.customerPct, 70);
  assert.equal(shared.companyPct, 30);
  assert.equal(shared.merchantPct, 0);
});

test("non-merchant modes keep merchantShare = 0", () => {
  const company = computeWaitingCharge(SEC(45), {
    freeMinutes: 0, chargePerMin: 2, maxMinutes: 30, maxCharge: 60, fundingMode: "COMPANY_100",
  });
  assert.equal(company.merchantShare, 0);
  const shared = computeWaitingCharge(SEC(45), {
    freeMinutes: 0, chargePerMin: 2, maxMinutes: 30, maxCharge: 60,
    fundingMode: "SHARED", customerSharePct: 50, companySharePct: 50,
  });
  assert.equal(shared.merchantShare, 0);
});

test("rider and customer paths return the same capped waiting for identical inputs (A-3 parity)", () => {
  // customer path (seconds) vs rider/shared path (minutes) — same rule, same result.
  const customer = computeWaitingCharge(SEC(45), {
    freeMinutes: 0,
    chargePerMin: 5,
    maxMinutes: 30,
    maxCharge: 60,
  }).capped;
  const rider = calcWaitingCharge(45, 0, 5, 30, 60);
  assert.equal(customer, rider);
  assert.equal(customer, 60);
});
