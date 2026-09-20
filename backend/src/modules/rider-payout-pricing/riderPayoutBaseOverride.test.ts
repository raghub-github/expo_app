import assert from "node:assert/strict";
import { test } from "node:test";
import { calculatePercentageRiderPayout } from "./riderPayoutPricing.service.js";
import { reconcileRiderLegs } from "@gatimitra/slab-pricing";
import type { ServicePayoutRuleRow } from "./types.js";

/**
 * Rider pay must come SOLELY from the rider's own pre/post distance legs — NEVER a percentage
 * of the customer delivery fee. These pin that contract.
 */

const rule: ServicePayoutRuleRow = {
  id: 1,
  serviceType: "food",
  vehicleType: null,
  geoLevel: "state",
  geoRefId: "x",
  riderPercentage: 90,
  platformPercentage: 10,
  waitingChargePerMin: 1,
  waitingFreeMinutes: 0,
  waitingMaxCharge: 100,
  waitingMaxMinutes: 60,
  waitingStartMode: "FIXED_GRACE",
  waitingKptGraceMinutes: null,
  waitingBulkValueThreshold: null,
  waitingBulkItemThreshold: null,
  waitingBulkExtraGraceMinutes: null,
  waitingFundingMode: "COMPANY_100",
  waitingCustomerSharePct: 0,
  waitingCompanySharePct: 100,
  priority: 100,
  isActive: true,
  effectiveFrom: null,
  effectiveTo: null,
};

test("baseOverride ignores the customer fare entirely (rider base = leg sum)", () => {
  // A huge customerFare must NOT inflate the rider base — baseOverride wins.
  const r = calculatePercentageRiderPayout({
    customerFare: 9999,
    pickupKm: 2,
    dropKm: 3,
    rule,
    baseOverride: 45, // pre+post distance-leg sum
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.quote.subtotalBeforeSurge, 45); // NOT 0.9 × 9999
  assert.equal(r.quote.finalAmount, 45);
  assert.equal(r.quote.platformRevenue, 0);
});

test("baseOverride works with a ₹0 customer fare (no NO_CUSTOMER_FARE error)", () => {
  const r = calculatePercentageRiderPayout({
    customerFare: 0,
    pickupKm: 1,
    dropKm: 1,
    rule,
    baseOverride: 22,
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.quote.finalAmount, 22);
});

test("surge % applies to the LEG base, not the customer fee", () => {
  const r = calculatePercentageRiderPayout({
    customerFare: 5000,
    pickupKm: 1,
    dropKm: 3,
    rule,
    baseOverride: 40,
    surgeTotal: 10, // resolved upstream on the leg base
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.quote.subtotalBeforeSurge, 40);
  assert.equal(r.quote.finalAmount, 50); // 40 + 10, never a fraction of 5000
});

test("reconcile leg-sum: food (company first-mile + customer post) = legBase + extras", () => {
  // food: pre first-mile company (on top), post customer (the pool = post only).
  const pre = { rawAmount: 16, funding: "company" as const };
  const post = { rawAmount: 20, funding: "customer" as const };
  const custLegSum = 20; // only the customer-funded post
  const c = reconcileRiderLegs({
    pool: custLegSum,
    pre,
    post,
    surge: 0,
    waiting: 0,
    tip: 0,
    capExcessToPool: false,
  });
  assert.equal(c.riderTotal, 36); // 16 (pre) + 20 (post) = legBase, no fee involved
});

test("reconcile leg-sum: parcel (both legs customer) + surge + tip", () => {
  const pre = { rawAmount: 12, funding: "customer" as const };
  const post = { rawAmount: 40, funding: "customer" as const };
  const custLegSum = 52;
  const c = reconcileRiderLegs({
    pool: custLegSum,
    pre,
    post,
    surge: 15,
    waiting: 5,
    tip: 10,
    capExcessToPool: false,
  });
  assert.equal(c.riderTotal, 82); // 12 + 40 + 15 + 5 + 10
});
