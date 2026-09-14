import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCancellationSlabPolicy,
  validateCancellationSlabs,
  selectCancellationSlab,
  DEFAULT_CANCELLATION_SLABS,
  type CancellationSlab,
} from "@gatimitra/financial-rules";

const SLABS = DEFAULT_CANCELLATION_SLABS;
const ev = (accepted: number, riderFault: number, enabled = true) =>
  evaluateCancellationSlabPolicy({ enabled, slabs: SLABS, accepted, riderFault });

// --- Spec §33 test matrix ---
test("5 accepted / 5 rider-fault (100%) → grace slab, NO block", () => {
  const d = ev(5, 5);
  assert.equal(d.currentSlab?.slabNumber, 1);
  assert.equal(d.reason, "grace_slab");
  assert.equal(d.shouldBlock, false);
  assert.equal(d.ratePct, 100);
});

test("15 accepted / 9 rider-fault (exactly 60%) → BLOCK (>=)", () => {
  const d = ev(15, 9);
  assert.equal(d.currentSlab?.slabNumber, 2);
  assert.equal(d.thresholdPct, 60);
  assert.equal(d.shouldBlock, true);
  assert.equal(d.reason, "threshold_reached");
});

test("15 accepted / 8 rider-fault (53.33%) → NO block", () => {
  const d = ev(15, 8);
  assert.equal(d.shouldBlock, false);
  assert.equal(d.reason, "below_threshold");
});

test("25 accepted / 8 rider-fault (32%) → below 35%, NO block", () => {
  const d = ev(25, 8);
  assert.equal(d.currentSlab?.slabNumber, 3);
  assert.equal(d.shouldBlock, false);
});

test("25 accepted / 9 rider-fault (36%) → BLOCK", () => {
  const d = ev(25, 9);
  assert.equal(d.currentSlab?.slabNumber, 3);
  assert.equal(d.shouldBlock, true);
});

// --- Slab 4 open-ended (26+) ---
test("75/15 (20%) → slab 4 BLOCK at exactly 20%", () => {
  assert.equal(ev(75, 15).shouldBlock, true);
});
test("76/15 (19.7%) → slab 4 (open-ended), below 20%, NO block", () => {
  const d = ev(76, 15);
  assert.equal(d.currentSlab?.slabNumber, 4);
  assert.equal(d.shouldBlock, false);
});
test("76/16 (21%) → slab 4 open-ended, BLOCK (no 76+ loophole)", () => {
  const d = ev(76, 16);
  assert.equal(d.currentSlab?.slabNumber, 4);
  assert.equal(d.shouldBlock, true);
});

// --- Boundaries (§36) ---
test("slab boundaries select correctly at 5/6/15/16/25/26", () => {
  assert.equal(selectCancellationSlab(SLABS, 5)?.slabNumber, 1);
  assert.equal(selectCancellationSlab(SLABS, 6)?.slabNumber, 2);
  assert.equal(selectCancellationSlab(SLABS, 15)?.slabNumber, 2);
  assert.equal(selectCancellationSlab(SLABS, 16)?.slabNumber, 3);
  assert.equal(selectCancellationSlab(SLABS, 25)?.slabNumber, 3);
  assert.equal(selectCancellationSlab(SLABS, 26)?.slabNumber, 4);
  assert.equal(selectCancellationSlab(SLABS, 100000)?.slabNumber, 4);
  assert.equal(selectCancellationSlab(SLABS, 0), null);
});

// --- Edge cases (§38) ---
test("0 accepted → no_accepted_orders, NO block", () => {
  assert.equal(ev(0, 0).reason, "no_accepted_orders");
});
test("1 accepted / 1 rider-fault → grace slab, NO block", () => {
  assert.equal(ev(1, 1).shouldBlock, false);
});
test("zero rider-fault at high volume → NO block even so", () => {
  const d = ev(50, 0);
  assert.equal(d.shouldBlock, false);
  assert.equal(d.reason, "no_rider_fault");
});
test("disabled policy → never blocks", () => {
  assert.equal(ev(15, 15, false).shouldBlock, false);
  assert.equal(ev(15, 15, false).reason, "policy_disabled");
});

// --- Integer-safe: block on true ratio, not rounded display (§12/§13) ---
test("7/11 = 63.63% uses true ratio (>=60 → block; display not used)", () => {
  const d = ev(11, 7); // 11 is slab 2, threshold 60
  assert.equal(d.shouldBlock, true); // 7/11 = 63.6% >= 60
});
test("exactly-at-threshold uses cross-multiplication (3/5 grace vs 6/10)", () => {
  // 6/10 = 60% at slab 2 (10 accepted) → block; integer compare 6*10000 >= 6000*10
  assert.equal(ev(10, 6).shouldBlock, true);
});

// --- Non-rider cancellations never inflate (§34): caller supplies rider-fault only ---
test("only rider-fault feeds the rate (5 of 15 = 33.33%, slab 3 at 15? no, slab 2)", () => {
  // 15 accepted, only 5 are rider-fault → 33.33% < 60% slab-2 threshold → NO block
  const d = ev(15, 5);
  assert.equal(d.shouldBlock, false);
  assert.equal(Math.round(d.ratePct * 100) / 100, 33.33);
});

// --- Validation (§22) ---
test("default slabs validate clean", () => {
  assert.deepEqual(validateCancellationSlabs(SLABS), []);
});
test("overlapping slabs are rejected", () => {
  const bad: CancellationSlab[] = [
    { slabNumber: 1, minAccepted: 1, maxAccepted: 10, blockingEnabled: false, thresholdPct: 0 },
    { slabNumber: 2, minAccepted: 8, maxAccepted: null, blockingEnabled: true, thresholdPct: 50 },
  ];
  assert.ok(validateCancellationSlabs(bad).length > 0);
});
test("gap between slabs is rejected", () => {
  const bad: CancellationSlab[] = [
    { slabNumber: 1, minAccepted: 1, maxAccepted: 5, blockingEnabled: false, thresholdPct: 0 },
    { slabNumber: 2, minAccepted: 10, maxAccepted: null, blockingEnabled: true, thresholdPct: 50 },
  ];
  assert.ok(validateCancellationSlabs(bad).some((e) => /contiguous/.test(e)));
});
test("not starting at 1 is rejected", () => {
  const bad: CancellationSlab[] = [
    { slabNumber: 1, minAccepted: 2, maxAccepted: null, blockingEnabled: true, thresholdPct: 50 },
  ];
  assert.ok(validateCancellationSlabs(bad).some((e) => /start at 1/.test(e)));
});
test("threshold out of range is rejected", () => {
  const bad: CancellationSlab[] = [
    { slabNumber: 1, minAccepted: 1, maxAccepted: null, blockingEnabled: true, thresholdPct: 150 },
  ];
  assert.ok(validateCancellationSlabs(bad).some((e) => /between 0 and 100/.test(e)));
});
