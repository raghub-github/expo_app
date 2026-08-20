import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_HOT_ZONE_CONFIG,
  classifyZone,
  demandWeight,
  pressureScore,
  supplyContribution,
  type HotZoneConfig,
} from "./pressure-model.js";

const cfg: HotZoneConfig = DEFAULT_HOT_ZONE_CONFIG;

// ---- master-spec Part 51 scenarios --------------------------------------------------

test("TEST 1/2/39/40: meaningful demand absent → NORMAL, regardless of supply", () => {
  // merchant online / no orders / many riders
  assert.equal(classifyZone({ weightedDemand: 0, effectiveSupply: 20, cfg }).status, "NORMAL");
  // 0 demand + 0 riders must NOT become HOT (the key anti-pattern)
  assert.equal(classifyZone({ weightedDemand: 0, effectiveSupply: 0, cfg }).status, "NORMAL");
  // below the min-demand gate (2 < 3) is still NORMAL even with zero supply
  assert.equal(classifyZone({ weightedDemand: 2, effectiveSupply: 0, cfg }).status, "NORMAL");
});

test("TEST 3: high demand + low supply → HOT/CRITICAL", () => {
  // demand 20, supply 1 → pressure 20 → CRITICAL
  assert.equal(classifyZone({ weightedDemand: 20, effectiveSupply: 1, cfg }).status, "CRITICAL");
  // demand 8, supply ~5 → pressure 1.6 → HOT (1.5..2.0)
  assert.equal(classifyZone({ weightedDemand: 8, effectiveSupply: 5, cfg }).status, "HOT");
});

test("TEST 4: high demand + high supply → lower pressure", () => {
  // demand 20, supply 20 → pressure 1.0 → WARM (not HOT)
  const r = classifyZone({ weightedDemand: 20, effectiveSupply: 20, cfg });
  assert.equal(r.status, "WARM");
  assert.ok(r.pressure < cfg.hotAt);
});

test("TEST 5: low demand + high supply → NORMAL", () => {
  // demand 3 (at gate), supply 20 → pressure 0.15 → NORMAL
  assert.equal(classifyZone({ weightedDemand: 3, effectiveSupply: 20, cfg }).status, "NORMAL");
});

test("TEST 12/23: rider at max capacity contributes 0 supply", () => {
  assert.equal(supplyContribution(0, 0, cfg), 0);
  // so demand 10 with only a full-capacity rider (supply 0 → floor) → high pressure
  assert.equal(classifyZone({ weightedDemand: 10, effectiveSupply: 0, cfg }).status, "CRITICAL");
});

test("TEST 13/23: partial capacity contributes proportionally", () => {
  assert.equal(supplyContribution(2, 0, cfg), 2); // same cell, 2 free slots
  // effective supply 4 (3+1+0 example from the spec) with demand 8 → pressure 2.0 → CRITICAL boundary
  assert.equal(classifyZone({ weightedDemand: 8, effectiveSupply: 4, cfg }).status, "CRITICAL");
});

test("TEST 19: neighbouring rider supply decays by H3 ring distance", () => {
  assert.equal(supplyContribution(4, 0, cfg), 4); // same cell full weight
  assert.equal(supplyContribution(4, 1, cfg), 2); // adjacent ring 50%
  assert.equal(supplyContribution(4, 2, cfg), 1); // two rings 25%
});

test("TEST 22/26: demand time-decay — recent orders weigh more", () => {
  assert.equal(demandWeight(0, cfg), 1); // brand new
  assert.equal(Number(demandWeight(600, cfg).toFixed(4)), 0.5); // one half-life
  assert.equal(Number(demandWeight(1200, cfg).toFixed(4)), 0.25); // two half-lives
  assert.ok(demandWeight(30, cfg) > demandWeight(900, cfg)); // newer > older
});

test("TEST 17/28: hysteresis — a HOT cell does not flap NORMAL on a tiny dip", () => {
  // Rise into HOT at pressure 1.6 (demand 16, supply 10)
  const hot = classifyZone({ weightedDemand: 16, effectiveSupply: 10, cfg });
  assert.equal(hot.status, "HOT");
  // Pressure dips to 1.4 (demand 14, supply 10): strict enter would say WARM, but the
  // sticky/leave threshold (hotAt - margin = 1.25) keeps it HOT.
  const held = classifyZone({
    weightedDemand: 14,
    effectiveSupply: 10,
    prevStatus: "HOT",
    cfg,
  });
  assert.equal(held.status, "HOT");
  // A real drop below the leave threshold (pressure 1.1 < 1.25) finally cools to WARM.
  const cooled = classifyZone({
    weightedDemand: 11,
    effectiveSupply: 10,
    prevStatus: "HOT",
    cfg,
  });
  assert.equal(cooled.status, "WARM");
});

test("pressureScore never divides by zero (supply floor)", () => {
  assert.equal(pressureScore(10, 0, cfg), 10 / cfg.minSupplyFloor);
  assert.ok(Number.isFinite(pressureScore(10, 0, cfg)));
});

test("thresholds are honoured exactly at the boundaries", () => {
  assert.equal(classifyZone({ weightedDemand: 10, effectiveSupply: 10, cfg }).status, "WARM"); // 1.0
  assert.equal(classifyZone({ weightedDemand: 15, effectiveSupply: 10, cfg }).status, "HOT"); // 1.5
  assert.equal(classifyZone({ weightedDemand: 20, effectiveSupply: 10, cfg }).status, "CRITICAL"); // 2.0
});
