import assert from "node:assert/strict";
import { test } from "node:test";
import {
  reconcileRiderLegs,
  clampLegAmount,
  type RiderLeg,
} from "@gatimitra/slab-pricing";

const round2 = (n: number) => Math.round(n * 100) / 100;
const leg = (rawAmount: number, funding: RiderLeg["funding"], extra: Partial<RiderLeg> = {}): RiderLeg => ({
  rawAmount,
  funding,
  ...extra,
});

// ── §43 — the headline requirement: pre and post are INDEPENDENT rates, never shared ──
test("§43: pre (₹3/km×4km=₹12) and post (₹8/km×6km=₹48) priced with DIFFERENT rates", () => {
  const r = reconcileRiderLegs({
    pool: 80,
    pre: leg(12, "customer", { distanceKm: 4, ratePerKm: 3 }),
    post: leg(48, "customer", { distanceKm: 6, ratePerKm: 8 }),
  });
  // The two legs keep their own independent raw entitlements — never the same value/rate.
  assert.equal(r.pre.rawAmount, 12);
  assert.equal(r.post.rawAmount, 48);
  assert.notEqual(r.pre.ratePerKm, r.post.ratePerKm);
  // Reconciled within the ₹80 pool: pre ₹12, post fills the rest → ₹68; rider gets the pool.
  assert.equal(r.pre.allocated, 12);
  assert.equal(r.post.allocated, 68);
  assert.equal(r.deliveryFeeFundedTotal, 80);
  assert.equal(r.riderDeliveryCredit, 80);
});

// The bug the user reported must be impossible: feeding distinct raws never collapses them.
test("pre and post raw amounts are preserved distinctly (no shared-rate collapse)", () => {
  const r = reconcileRiderLegs({ pool: 200, pre: leg(15, "customer"), post: leg(60, "customer") });
  assert.equal(r.pre.rawAmount, 15);
  assert.equal(r.post.rawAmount, 60);
  assert.notEqual(r.pre.rawAmount, r.post.rawAmount);
});

// ── Funding: FOOD default (pre company-funded on top, post customer within pool) ──
test("food default: pre company-funded on top, post customer within pool", () => {
  const r = reconcileRiderLegs({
    pool: 80,
    pre: leg(12, "company"),
    post: leg(50, "customer"),
    surge: 0,
  });
  assert.equal(r.pre.companyFunded, 12);
  assert.equal(r.pre.customerFunded, 0);
  assert.equal(r.pre.allocated, 0); // company-funded pre is NOT drawn from the pool
  assert.equal(r.post.allocated, 80); // post fills the whole pool
  assert.equal(r.deliveryFeeFundedTotal, 80); // Ledger A = pool
  assert.equal(r.companyFundedTotal, 12); // Ledger B = company pre
  assert.equal(r.riderDeliveryCredit, 92); // 80 + 12
});

// ── Both legs customer-funded within the pool (parcel / person ride default) ──
test("parcel/ride default: both legs customer-funded, rider paid the pool", () => {
  const r = reconcileRiderLegs({
    pool: 80,
    pre: leg(15, "customer"),
    post: leg(45, "customer"),
    surge: 20,
  });
  assert.equal(r.pre.allocated, 15);
  assert.equal(r.post.allocated, 65); // 45 + (80 − 60) remainder
  assert.equal(r.deliveryFeeFundedTotal, 80);
  assert.equal(r.companyFundedTotal, 20); // surge only
  assert.equal(r.riderDeliveryCredit, 100); // 80 + 20 surge
});

// ── Cap case: customer-funded raw exceeds the pool → capped at pool, excess recorded ──
test("customer legs exceeding the pool are capped (pre first); excess recorded", () => {
  const r = reconcileRiderLegs({
    pool: 50,
    pre: leg(30, "customer"),
    post: leg(40, "customer"),
  });
  assert.equal(r.pre.allocated, 30);
  assert.equal(r.post.allocated, 20); // 50 − 30
  assert.equal(r.poolExcess, 20); // (30+40) − 50
  assert.equal(r.companyExcessTopup, 0); // default caps (does not company-fund)
  assert.equal(r.riderDeliveryCredit, 50); // capped at the pool
});

test("capExcessToPool=false funds the overflow from the company", () => {
  const r = reconcileRiderLegs({
    pool: 50,
    pre: leg(30, "customer"),
    post: leg(40, "customer"),
    capExcessToPool: false,
  });
  assert.equal(r.poolExcess, 20);
  assert.equal(r.companyExcessTopup, 20);
  assert.equal(r.riderDeliveryCredit, 70); // 50 pool + 20 company top-up
});

// ── Shared funding: a leg split between customer (pool) and company (top) ──
test("shared funding splits a leg between the pool and the company", () => {
  const r = reconcileRiderLegs({
    pool: 100,
    pre: leg(20, "shared", { customerSharePct: 60 }), // ₹12 customer, ₹8 company
    post: leg(0, "customer"),
  });
  assert.equal(r.pre.customerFunded, 12);
  assert.equal(r.pre.companyFunded, 8);
  assert.equal(r.companyFundedTotal, 8);
  assert.equal(r.deliveryFeeFundedTotal, 100); // pool
  assert.equal(r.riderDeliveryCredit, 108);
});

// ── No post rule configured → post = pool remainder (v3.1 backward compatibility) ──
test("no post rule (rawPost=0): post = pool remainder, backward compatible", () => {
  const r = reconcileRiderLegs({ pool: 80, pre: leg(15, "customer"), post: leg(0, "customer") });
  assert.equal(r.post.allocated, 65); // 80 − 15
  assert.equal(r.riderDeliveryCredit, 80);
});

// ── GatiMitra Plus: pool from gross entitlement even when customer collected 0 ──
test("GatiMitra Plus: pool from gross drives pay even when collected = 0", () => {
  const grossPool = 48; // = gross delivery ₹60 × 80%
  const r = reconcileRiderLegs({ pool: grossPool, pre: leg(12, "customer"), post: leg(36, "customer") });
  assert.equal(r.riderDeliveryCredit, 48);
  assert.equal(r.pre.allocated, 12);
  assert.equal(r.post.allocated, 36);
});

// ── waiting → Ledger A; surge/incentive → Ledger B; tip passthrough ──
test("waiting in Ledger A, surge+incentive in Ledger B, tip passthrough", () => {
  const r = reconcileRiderLegs({
    pool: 80,
    pre: leg(10, "customer"),
    post: leg(20, "customer"),
    surge: 25,
    waiting: 8,
    tip: 30,
    companyIncentive: 15,
  });
  assert.equal(r.deliveryFeeFundedTotal, 88); // 80 pool + 8 waiting
  assert.equal(r.companyFundedTotal, 40); // surge 25 + incentive 15
  assert.equal(r.riderDeliveryCredit, 128); // 88 + 40
  assert.equal(r.riderTotal, 158); // + tip 30
});

// ── clampLegAmount: rate×km then min/max, per §12 ──
test("clampLegAmount applies min then max (null-safe)", () => {
  assert.equal(clampLegAmount(3, 5, 20), 5); // 1km×₹3 raised to min ₹5
  assert.equal(clampLegAmount(12, 5, 20), 12); // within band
  assert.equal(clampLegAmount(30, 5, 20), 20); // capped at max ₹20
  assert.equal(clampLegAmount(30, null, null), 30); // no caps configured
  assert.equal(clampLegAmount(30, null, 25), 25);
  assert.equal(clampLegAmount(3, 5, null), 5);
});

// ── Invariant sweep: reconciliation always self-consistent, delivery-funded ≤ pool+waiting ──
test("INVARIANTS across a grid of pools/legs/funding/surge/waiting", () => {
  const fundings = ["company", "customer", "shared"] as const;
  for (const pool of [0, 30, 80, 150]) {
    for (const preRaw of [0, 12, 40, 90]) {
      for (const postRaw of [0, 20, 48, 120]) {
        for (const pf of fundings) {
          for (const qf of fundings) {
            for (const surge of [0, 20]) {
              for (const waiting of [0, 6]) {
                const r = reconcileRiderLegs({
                  pool,
                  pre: leg(preRaw, pf, { customerSharePct: 50 }),
                  post: leg(postRaw, qf, { customerSharePct: 50 }),
                  surge,
                  waiting,
                });
                const tag = `${pool}/${preRaw}/${postRaw}/${pf}/${qf}/${surge}/${waiting}`;
                // delivery-funded (customer/pool part) never exceeds pool + waiting.
                assert.ok(r.deliveryFeeFundedTotal <= round2(pool + waiting) + 0.001, `A<=pool ${tag}`);
                // allocated pre + post equals the pool (rider is paid the pool).
                assert.equal(round2(r.pre.allocated + r.post.allocated), pool, `alloc=pool ${tag}`);
                // credit == Ledger A + Ledger B.
                assert.equal(
                  r.riderDeliveryCredit,
                  round2(r.deliveryFeeFundedTotal + r.companyFundedTotal),
                  `credit=A+B ${tag}`
                );
                // nothing negative.
                for (const v of [r.pre.allocated, r.post.allocated, r.companyFundedTotal, r.riderDeliveryCredit]) {
                  assert.ok(v >= 0, `nonneg ${tag}`);
                }
                // raw legs are preserved distinctly (never overwritten/shared).
                assert.equal(r.pre.rawAmount, round2(preRaw), `preRaw ${tag}`);
                assert.equal(r.post.rawAmount, round2(postRaw), `postRaw ${tag}`);
              }
            }
          }
        }
      }
    }
  }
});