import test from "node:test";
import assert from "node:assert/strict";
import { computeWaitingCharge, normalizeFundingShares } from "./rideWaitingCharge.js";

test("wait fully inside free minutes charges nothing", () => {
  const r = computeWaitingCharge(90, { freeMinutes: 2, chargePerMin: 1 });
  assert.equal(r.gross, 0);
  assert.equal(r.capped, 0);
  assert.equal(r.customerShare, 0);
  assert.equal(r.companyShare, 0);
});

test("billable minutes are ceil-rounded above the free budget", () => {
  // 2 free min = 120s; 190s wait -> 70s billable -> ceil(70/60) = 2 chargeable minutes
  const r = computeWaitingCharge(190, { freeMinutes: 2, chargePerMin: 3 });
  assert.equal(r.chargeableMinutes, 2);
  assert.equal(r.gross, 6);
  assert.equal(r.capped, 6);
});

test("max charge caps the gross amount", () => {
  const r = computeWaitingCharge(600, { freeMinutes: 0, chargePerMin: 5, maxCharge: 10 });
  assert.equal(r.gross, 50);
  assert.equal(r.capped, 10);
});

test("CUSTOMER_100 funding: customer pays the full capped amount", () => {
  const r = computeWaitingCharge(300, { freeMinutes: 0, chargePerMin: 2, fundingMode: "CUSTOMER_100" });
  assert.equal(r.customerShare, r.capped);
  assert.equal(r.companyShare, 0);
  assert.equal(r.fundingMode, "CUSTOMER_100");
});

test("COMPANY_100 funding: company pays the full capped amount, customer bill untouched", () => {
  const r = computeWaitingCharge(300, { freeMinutes: 0, chargePerMin: 2, fundingMode: "COMPANY_100" });
  assert.equal(r.customerShare, 0);
  assert.equal(r.companyShare, r.capped);
  assert.equal(r.fundingMode, "COMPANY_100");
});

test("SHARED funding splits proportionally and normalizes to 100", () => {
  const r = computeWaitingCharge(300, {
    freeMinutes: 0,
    chargePerMin: 2,
    fundingMode: "SHARED",
    customerSharePct: 30,
    companySharePct: 70,
  });
  assert.equal(r.customerShare + r.companyShare, r.capped);
  assert.equal(r.customerShare, Math.round(r.capped * 0.3 * 100) / 100);
});

test("SHARED funding with zero/zero shares falls back to 50/50", () => {
  const shares = normalizeFundingShares("SHARED", 0, 0);
  assert.equal(shares.customerPct, 50);
  assert.equal(shares.companyPct, 50);
});

test("zero or negative wait seconds never charges", () => {
  assert.equal(computeWaitingCharge(0, { freeMinutes: 0, chargePerMin: 5 }).capped, 0);
  assert.equal(computeWaitingCharge(-100, { freeMinutes: 0, chargePerMin: 5 }).capped, 0);
});

test("zero charge-per-min never charges regardless of wait", () => {
  const r = computeWaitingCharge(600, { freeMinutes: 0, chargePerMin: 0 });
  assert.equal(r.capped, 0);
});
