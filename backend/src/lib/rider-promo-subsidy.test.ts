/**
 * Money conservation for the promotion-subsidy split: whatever the rider is paid
 * for the fare is funded exactly by the customer's collection plus the company
 * subsidy — no rupee created or lost, at any discount, and the rider share is
 * never reduced by the customer's offer. Property grid over the input space.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRiderFundingSplit } from "./rider-promo-subsidy.ts";

test("conservation: collectedFare + companySubsidy === riderShare + platformRevenue", () => {
  for (const grossBasis of [0, 20, 50, 100, 240, 500, 1000]) {
    for (const riderPct of [0, 0.6, 0.75, 0.8, 1]) {
      for (const discount of [0, 10, 50, 100, 300, 1000]) {
        const riderShare = grossBasis * riderPct;
        const s = resolveRiderFundingSplit({ grossBasis, riderShare, discount });
        const label = `gross${grossBasis} pct${riderPct} disc${discount}`;

        // 1. Money conservation.
        assert.equal(
          round(s.collectedFare + s.companySubsidy),
          round(s.riderShare + s.platformRevenue),
          `conservation: ${label}`
        );
        // 2. No negative components.
        assert.ok(
          s.collectedFare >= 0 && s.companySubsidy >= 0 && s.platformRevenue >= 0,
          `non-neg: ${label}`
        );
        // 3. Rider share is offer-independent (only depends on gross × pct, capped at gross).
        assert.equal(s.riderShare, round(Math.min(grossBasis * riderPct, grossBasis)), `rider fixed: ${label}`);
      }
    }
  }
});

test("100% free ride: customer pays 0, rider stays whole, company funds the rider share", () => {
  const s = resolveRiderFundingSplit({ grossBasis: 100, riderShare: 80, discount: 100 });
  assert.equal(s.collectedFare, 0);
  assert.equal(s.riderShare, 80);
  assert.equal(s.platformRevenue, 0);
  assert.equal(s.companySubsidy, 80); // whole rider share is company-funded
});

test("flat ₹50 off ₹100, rider 80%: discount comes out of platform margin, no subsidy", () => {
  const s = resolveRiderFundingSplit({ grossBasis: 100, riderShare: 80, discount: 50 });
  assert.equal(s.collectedFare, 50);
  assert.equal(s.riderShare, 80);
  assert.equal(s.platformRevenue, 0); // platform margin (20) fully consumed
  assert.equal(s.companySubsidy, 30); // 50 discount − 20 platform margin = 30 company-funded
});

test("no discount: platform keeps its full margin, zero subsidy", () => {
  const s = resolveRiderFundingSplit({ grossBasis: 100, riderShare: 75, discount: 0 });
  assert.equal(s.collectedFare, 100);
  assert.equal(s.riderShare, 75);
  assert.equal(s.platformRevenue, 25);
  assert.equal(s.companySubsidy, 0);
});

test("₹1000 discount can never make the rider share negative or invent money", () => {
  const s = resolveRiderFundingSplit({ grossBasis: 240, riderShare: 200, discount: 1000 });
  assert.equal(s.discount, 240); // clamped to gross
  assert.equal(s.collectedFare, 0);
  assert.equal(s.riderShare, 200);
  assert.equal(s.companySubsidy, 200);
  assert.equal(round(s.collectedFare + s.companySubsidy), round(s.riderShare + s.platformRevenue));
});

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
