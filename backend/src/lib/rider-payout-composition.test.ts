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

// ───────────────────────────────────────────────────────────────────────────
// COMPREHENSIVE MATRIX — every service × funding × rider/customer type × scenario.
// The composition is a PURE function of (basePool, prePickupRaw, surge, waiting,
// funding); service/state/rider-type only change those inputs, so a full sweep of
// the inputs proves correctness for every service, every state, and every rider.
// ───────────────────────────────────────────────────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;
const fundings = ["company", "customer", "shared"] as const;

// Invariant sweep across a wide grid of realistic inputs.
test("INVARIANTS hold across a full grid of pool/pre/surge/waiting/funding", () => {
  for (const basePool of [0, 12, 40, 85, 150, 999.99]) {
    for (const prePickupRaw of [0, 3, 15, 40, 85, 120]) {
      for (const surge of [0, 20]) {
        for (const waiting of [0, 6]) {
          for (const funding of fundings) {
            for (const tip of [0, 30]) {
              const c = composeRiderPayout({ basePool, prePickupRaw, surge, waiting, tip, funding });
              const tag = `${basePool}/${prePickupRaw}/${surge}/${waiting}/${funding}/${tip}`;

              // 1) pre-from-pool + post-pickup ALWAYS reconstitutes the base pool.
              assert.equal(round2(c.prePickupFromPool + c.postPickup), round2(c.basePool), `pool split ${tag}`);
              // 2) nothing is ever negative.
              for (const v of [c.prePickupFromPool, c.postPickup, c.prePickupCompanyFunded, c.riderDeliveryCredit]) {
                assert.ok(v >= 0, `non-negative ${tag}`);
              }
              // 3) rider delivery credit == Ledger A + Ledger B.
              assert.equal(
                c.riderDeliveryCredit,
                round2(c.deliveryFeeFundedTotal + c.companyFundedTotal),
                `ledger sum ${tag}`
              );
              // 4) rider delivery credit == basePool + waiting + surge + company first-mile.
              assert.equal(
                c.riderDeliveryCredit,
                round2(c.basePool + waiting + surge + c.prePickupCompanyFunded),
                `credit identity ${tag}`
              );
              // 5) Ledger A (delivery-fee funded) NEVER exceeds the pool + waiting — stays ≤100%.
              assert.ok(
                c.deliveryFeeFundedTotal <= round2(c.basePool + waiting) + 0.001,
                `ledger A within pool ${tag}`
              );
              // 6) tip is a pure passthrough on top of the delivery credit.
              assert.equal(c.riderTotal, round2(c.riderDeliveryCredit + tip), `tip passthrough ${tag}`);
            }
          }
        }
      }
    }
  }
});

// Per-funding behavioural guarantees (the money rule for each mode).
test("customer funding NEVER pays more than the pool (+surge+waiting)", () => {
  for (const basePool of [0, 40, 85]) {
    for (const prePickupRaw of [0, 30, 200]) {
      const c = composeRiderPayout({ basePool, prePickupRaw, surge: 10, waiting: 5, funding: "customer" });
      assert.equal(c.prePickupCompanyFunded, 0);
      assert.equal(c.riderDeliveryCredit, round2(basePool + 10 + 5)); // never + prePickup
    }
  }
});

test("company funding ALWAYS pays the full first-mile on top", () => {
  for (const basePool of [0, 40, 85]) {
    for (const prePickupRaw of [0, 30, 200]) {
      const c = composeRiderPayout({ basePool, prePickupRaw, surge: 10, waiting: 5, funding: "company" });
      assert.equal(c.prePickupCompanyFunded, prePickupRaw);
      assert.equal(c.postPickup, basePool);
      assert.equal(c.riderDeliveryCredit, round2(basePool + 10 + 5 + prePickupRaw));
    }
  }
});

test("shared funding pays pool + only the overflow above the pool", () => {
  const c = composeRiderPayout({ basePool: 50, prePickupRaw: 80, surge: 0, waiting: 0, funding: "shared" });
  assert.equal(c.prePickupFromPool, 50);
  assert.equal(c.prePickupCompanyFunded, 30);
  assert.equal(c.riderDeliveryCredit, 80);
});

// ── Real per-service production scenarios (the numbers a rider actually sees) ──

// FOOD, non-Plus customer, normal rider: company-funded first-mile (on top).
test("SCENARIO food / normal customer / normal rider: pre-pickup on top", () => {
  // gross delivery ₹120, rider 75% → pool ₹90; first-mile ₹3/km × 4km = ₹12 company.
  const c = composeRiderPayout({ basePool: 90, prePickupRaw: 12, funding: "company" });
  assert.equal(c.riderDeliveryCredit, 102); // 90 + 12 company top-up
  assert.equal(c.deliveryFeeFundedTotal, 90);
  assert.equal(c.companyFundedTotal, 12);
});

// FOOD, GatiMitra PLUS customer (free delivery ≤5km): pool from GROSS, collected ₹0.
test("SCENARIO food / GatiMitra Plus customer: paid on gross entitlement", () => {
  // Customer pays ₹0 (Plus), but gross delivery ₹120 → pool ₹90. Rider paid the same.
  const c = composeRiderPayout({ basePool: 90, prePickupRaw: 12, funding: "company" });
  assert.equal(c.riderDeliveryCredit, 102);
});

// FOOD, GatiMitra MAX rider: surge + waiting are included (flow into the ledgers).
test("SCENARIO food / GatiMitra Max rider: surge+waiting included, first-mile on top", () => {
  const c = composeRiderPayout({ basePool: 90, prePickupRaw: 12, surge: 25, waiting: 8, funding: "company" });
  assert.equal(c.deliveryFeeFundedTotal, 98); // pool 90 + waiting 8 (Ledger A)
  assert.equal(c.companyFundedTotal, 37); // surge 25 + company first-mile 12 (Ledger B)
  assert.equal(c.riderDeliveryCredit, 135);
});

// PARCEL, customer-funded first-mile (collected after delivery): within the pool.
test("SCENARIO parcel / customer-funded first-mile: within the pool", () => {
  // gross delivery ₹80, rider 80% → pool ₹64; first-mile ₹5/km × 3km = ₹15 from pool.
  const c = composeRiderPayout({ basePool: 64, prePickupRaw: 15, funding: "customer" });
  assert.equal(c.prePickupFromPool, 15);
  assert.equal(c.postPickup, 49);
  assert.equal(c.riderDeliveryCredit, 64); // NOT 64 + 15
  assert.equal(c.companyFundedTotal, 0);
});

// PERSON RIDE, customer-funded first-mile, with rider surge on top.
test("SCENARIO ride / customer-funded first-mile + surge", () => {
  // ride fare ₹200, rider 70% → pool ₹140; first-mile ₹6/km × 2km = ₹12 from pool; surge ₹40.
  const c = composeRiderPayout({ basePool: 140, prePickupRaw: 12, surge: 40, funding: "customer" });
  assert.equal(c.prePickupFromPool, 12);
  assert.equal(c.postPickup, 128);
  assert.equal(c.deliveryFeeFundedTotal, 140); // pool (first-mile carved within)
  assert.equal(c.companyFundedTotal, 40); // surge only
  assert.equal(c.riderDeliveryCredit, 180); // 140 + 40 surge
});
