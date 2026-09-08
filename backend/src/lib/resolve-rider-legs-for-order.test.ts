import assert from "node:assert/strict";
import { test } from "node:test";
import { decidePreLegResult } from "./resolve-rider-legs-for-order.js";

const fallback = { amount: 5, funding: "company" as const };

test("matched rule → pays the rule amount + funding (ignores fallback)", () => {
  const r = decidePreLegResult(
    { matched: true, rawAmount: 12, funding: "customer", ruleId: 7, ratePerKm: 4 },
    fallback,
    3
  );
  assert.equal(r.amount, 12);
  assert.equal(r.funding, "customer");
  assert.equal(r.matched, true);
  assert.equal(r.ruleId, 7);
});

test("rule exists but rider is below min_km → 0, NO legacy fallback", () => {
  const r = decidePreLegResult(
    { matched: false, belowConfiguredMinKm: true, rawAmount: 0, funding: "company", ruleId: null, ratePerKm: 0 },
    fallback, // non-zero fallback must be ignored
    0.5
  );
  assert.equal(r.amount, 0, "inside the no-first-mile radius pays nothing");
  assert.equal(r.matched, false);
});

test("no rule on the chain → legacy fallback allowance", () => {
  const r = decidePreLegResult(
    { matched: false, rawAmount: 0, funding: "company", ruleId: null, ratePerKm: 0 },
    fallback,
    9
  );
  assert.equal(r.amount, 5, "far rider with no leg rule keeps the legacy fallback");
  assert.equal(r.funding, "company");
});

test("no rule and no fallback → 0", () => {
  const r = decidePreLegResult(null, null, 3);
  assert.equal(r.amount, 0);
});
