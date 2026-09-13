import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCancellationBlock,
  riderFaultRate,
} from "./rider-cancellation-block-policy.js";
import {
  resolveLegResponsibility,
  responsibilityFromCatalogAttribute,
} from "./cancellation-responsibility.js";

const CFG = { enabled: true, thresholdPct: 35, minAccepted: 20 };

test("riderFaultRate: full precision, 0 when no accepted", () => {
  assert.equal(riderFaultRate({ accepted: 50, riderFault: 12 }), 24);
  assert.equal(riderFaultRate({ accepted: 0, riderFault: 0 }), 0);
});

test("blocks when rider-fault rate reaches the threshold (>=)", () => {
  // 35% threshold, 21/60 = 35% exactly -> block (reaching it blocks).
  const d = evaluateCancellationBlock(CFG, { accepted: 60, riderFault: 21 });
  assert.equal(d.shouldBlock, true);
  assert.equal(d.reason, "rate_at_or_above_threshold");
});

test("does not block just below the threshold", () => {
  // 20/60 = 33.33% < 35%.
  const d = evaluateCancellationBlock(CFG, { accepted: 60, riderFault: 20 });
  assert.equal(d.shouldBlock, false);
  assert.equal(d.reason, "below_threshold");
});

test("respects the minimum accepted-orders guard", () => {
  // 1 accepted, 1 rider-fault = 100% but below min accepted (20) -> no block.
  const d = evaluateCancellationBlock(CFG, { accepted: 1, riderFault: 1 });
  assert.equal(d.shouldBlock, false);
  assert.equal(d.reason, "below_min_accepted");
});

test("never blocks with zero rider-fault cancellations, even at a 0% threshold", () => {
  const d = evaluateCancellationBlock(
    { enabled: true, thresholdPct: 0, minAccepted: 0 },
    { accepted: 100, riderFault: 0 }
  );
  assert.equal(d.shouldBlock, false);
  assert.equal(d.reason, "no_rider_fault");
});

test("disabled rule never blocks", () => {
  const d = evaluateCancellationBlock(
    { enabled: false, thresholdPct: 10, minAccepted: 0 },
    { accepted: 100, riderFault: 90 }
  );
  assert.equal(d.shouldBlock, false);
  assert.equal(d.reason, "disabled");
});

test("only rider-fault cancellations feed the block (responsibility mapper parity)", () => {
  assert.equal(responsibilityFromCatalogAttribute("RIDER"), "RIDER_FAULT");
  assert.equal(responsibilityFromCatalogAttribute("CUSTOMER"), "CUSTOMER_FAULT");
  assert.equal(
    resolveLegResponsibility({ exclusionSource: "rider_cancel_assigned", exclusionAttribute: null }),
    "RIDER_FAULT"
  );
  assert.equal(
    resolveLegResponsibility({ exclusionSource: "admin_unassign", exclusionAttribute: null }),
    "UNKNOWN"
  );
  assert.equal(
    resolveLegResponsibility({ exclusionSource: null, terminalAttribute: "CUSTOMER" }),
    "CUSTOMER_FAULT"
  );
});
