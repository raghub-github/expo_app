import assert from "node:assert/strict";
import { test } from "node:test";
import {
  composeRiderPayout,
  defaultPrePickupFunding,
  normalizePrePickupFunding,
} from "./rider-payout-composition.js";

// Example A — the sign-off scenario: gross ₹100, rider 85% → pool ₹85.
// Customer-funded first-mile ₹15 → carved from the pool: pre ₹15 + post ₹70 = ₹85 total.
test("A: customer-funded pre-pickup is carved from the pool (stays within 100%)", () => {
  const c = composeRiderPayout({ basePool: 85, prePickupRaw: 15, funding: "customer" });
  assert.equal(c.prePickupFromPool, 15);
  assert.equal(c.postPickup, 70);
  assert.equal(c.prePickupCompanyFunded, 0);
  assert.equal(c.deliveryFeeFundedTotal, 85);
  assert.equal(c.companyFundedTotal, 0);
  assert.equal(c.riderDeliveryCredit, 85); // NOT 85 + 15
  assert.equal(c.prePickupCappedAtPool, false);
});

// Example B — company-funded first-mile (FOOD default): added ON TOP, may exceed 100%.
test("B: company-funded pre-pickup is paid on top of the pool", () => {
  const c = composeRiderPayout({ basePool: 85, prePickupRaw: 15, funding: "company" });
  assert.equal(c.prePickupFromPool, 0);
  assert.equal(c.postPickup, 85); // full pool goes to post-pickup
  assert.equal(c.prePickupCompanyFunded, 15);
  assert.equal(c.deliveryFeeFundedTotal, 85);
  assert.equal(c.companyFundedTotal, 15);
  assert.equal(c.riderDeliveryCredit, 100); // 85 pool + 15 company top-up
});

// Example C — edge case: customer-funded pre-pickup EXCEEDS the pool → capped, post = 0.
test("C: customer-funded pre-pickup above the pool is capped (post-pickup = 0)", () => {
  const c = composeRiderPayout({ basePool: 40, prePickupRaw: 55, funding: "customer" });
  assert.equal(c.prePickupFromPool, 40);
  assert.equal(c.postPickup, 0);
  assert.equal(c.prePickupCompanyFunded, 0);
  assert.equal(c.riderDeliveryCredit, 40); // capped at the pool
  assert.equal(c.prePickupCappedAtPool, true);
});

// Example D — "shared": carve from the pool, company funds the overflow (§4 override).
test("D: shared funding pays the pool + company-funded overflow", () => {
  const c = composeRiderPayout({ basePool: 40, prePickupRaw: 55, funding: "shared" });
  assert.equal(c.prePickupFromPool, 40);
  assert.equal(c.postPickup, 0);
  assert.equal(c.prePickupCompanyFunded, 15); // 55 − 40
  assert.equal(c.prePickupPaid, 55);
  assert.equal(c.riderDeliveryCredit, 55); // 40 pool + 15 company
  assert.equal(c.companyFundedTotal, 15);
});

// Example E — surge + waiting sit in the correct ledgers, tip is a passthrough.
test("E: surge → company ledger, waiting → delivery ledger, tip passthrough", () => {
  const c = composeRiderPayout({
    basePool: 85,
    prePickupRaw: 15,
    surge: 20,
    waiting: 10,
    tip: 30,
    funding: "customer",
  });
  // Ledger A = pool(85) + waiting(10) = 95
  assert.equal(c.deliveryFeeFundedTotal, 95);
  // Ledger B = surge(20) + company pre-pickup(0) = 20
  assert.equal(c.companyFundedTotal, 20);
  assert.equal(c.riderDeliveryCredit, 115); // 95 + 20
  assert.equal(c.riderTotal, 145); // + tip 30
});

// Example F — GatiMitra Plus: customer collected ₹0 but gross entitlement drives the pool.
// The composition is fed the GROSS-derived pool, so the rider is paid the same regardless.
test("F: pool derived from GROSS entitlement pays the rider even when collected = 0", () => {
  const grossPool = 85; // = grossDeliveryFee(100) × 85%, even though customer paid 0
  const c = composeRiderPayout({ basePool: grossPool, prePickupRaw: 15, funding: "customer" });
  assert.equal(c.riderDeliveryCredit, 85);
  assert.equal(c.postPickup, 70);
  assert.equal(c.prePickupFromPool, 15);
});

// Zero pre-pickup is a pure no-op — total equals the pool (+ surge/waiting).
test("zero pre-pickup: total is just the pool regardless of funding", () => {
  for (const funding of ["company", "customer", "shared"] as const) {
    const c = composeRiderPayout({ basePool: 85, prePickupRaw: 0, funding });
    assert.equal(c.riderDeliveryCredit, 85, funding);
    assert.equal(c.postPickup, 85, funding);
    assert.equal(c.prePickupPaid, 0, funding);
  }
});

// Company-funded parity: v3.1 company funding must equal the old on-top v3.0 total.
test("company funding preserves the legacy on-top total (no payout regression)", () => {
  const basePool = 72,
    surge = 18,
    waiting = 6,
    preRaw = 12;
  const c = composeRiderPayout({ basePool, prePickupRaw: preRaw, surge, waiting, funding: "company" });
  const legacyFinalAmount = basePool + surge + waiting; // v3.0 finalAmount
  assert.equal(c.riderDeliveryCredit, legacyFinalAmount + preRaw);
});

test("defaultPrePickupFunding: food=company, parcel/ride=customer", () => {
  assert.equal(defaultPrePickupFunding("food"), "company");
  assert.equal(defaultPrePickupFunding("parcel"), "customer");
  assert.equal(defaultPrePickupFunding("ride"), "customer");
  assert.equal(defaultPrePickupFunding("person_ride"), "customer");
  assert.equal(defaultPrePickupFunding("unknown"), "company");
});

test("normalizePrePickupFunding: guards junk to fallback", () => {
  assert.equal(normalizePrePickupFunding("COMPANY"), "company");
  assert.equal(normalizePrePickupFunding("customer"), "customer");
  assert.equal(normalizePrePickupFunding("nonsense"), "company");
  assert.equal(normalizePrePickupFunding(null, "customer"), "customer");
});

// Guards: negative / non-finite inputs collapse to 0, never negative post-pickup.
test("guards: negatives collapse, post-pickup never negative", () => {
  const c = composeRiderPayout({ basePool: -5, prePickupRaw: -10, funding: "customer" });
  assert.equal(c.basePool, 0);
  assert.equal(c.postPickup, 0);
  assert.equal(c.riderDeliveryCredit, 0);
});
