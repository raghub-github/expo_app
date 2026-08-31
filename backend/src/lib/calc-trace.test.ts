/**
 * calc_trace is the per-order audit record of how a payout was resolved. It must
 * be freeze-once per engine (idempotent on completion retries / app restart) and
 * round-trip through the billing snapshot.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendCalcTrace,
  buildRiderCalcTraceEntry,
  readCalcTrace,
  type RiderPayoutTrace,
} from "./calc-trace.ts";

const trace: RiderPayoutTrace = {
  level: "district",
  refId: "11111111-1111-1111-1111-111111111111",
  ruleId: 42,
  rulePriority: 100,
  riderPercentage: 80,
  grossBasis: 100,
  vehicleType: "2_wheeler",
};

test("buildRiderCalcTraceEntry captures geo node, rule, basis; serviceOn=true", () => {
  const e = buildRiderCalcTraceEntry("ride", trace)!;
  assert.equal(e.engine, "rider_payout");
  assert.equal(e.service, "ride");
  assert.deepEqual(e.resolvedGeo, { level: "district", refId: trace.refId });
  assert.equal(e.ruleId, 42);
  assert.equal(e.riderPct, 80);
  assert.equal(e.grossBasis, 100);
  assert.equal(e.serviceOn, true);
  assert.equal(e.vehicleType, "2_wheeler");
});

test("null trace → null entry (no crash when no rule resolved)", () => {
  assert.equal(buildRiderCalcTraceEntry("ride", null), null);
});

test("appendCalcTrace stamps under calc_trace.rider_payout, preserving other keys", () => {
  const entry = buildRiderCalcTraceEntry("ride", trace);
  const snap = appendCalcTrace({ delivery_fee: 40 }, entry);
  assert.equal((snap as any).delivery_fee, 40);
  assert.equal(readCalcTrace(snap, "rider_payout")?.ruleId, 42);
});

test("freeze-once: a second entry for the same engine does not overwrite the first", () => {
  const first = buildRiderCalcTraceEntry("ride", trace);
  let snap = appendCalcTrace({}, first);
  const second = buildRiderCalcTraceEntry("ride", { ...trace, ruleId: 999, riderPercentage: 50 });
  snap = appendCalcTrace(snap, second);
  // The first authoritative resolution is frozen.
  assert.equal(readCalcTrace(snap, "rider_payout")?.ruleId, 42);
  assert.equal(readCalcTrace(snap, "rider_payout")?.riderPct, 80);
});

test("distinct engines coexist under calc_trace", () => {
  const rider = buildRiderCalcTraceEntry("ride", trace);
  let snap = appendCalcTrace({}, rider);
  snap = appendCalcTrace(snap, {
    engine: "customer_billing",
    service: "ride",
    resolvedGeo: { level: "district", refId: trace.refId },
    ruleId: 7,
    rulePriority: 100,
    riderPct: null,
    grossBasis: 100,
    serviceOn: true,
    vehicleType: null,
    ts: new Date().toISOString(),
  });
  assert.equal(readCalcTrace(snap, "rider_payout")?.ruleId, 42);
  assert.equal(readCalcTrace(snap, "customer_billing")?.ruleId, 7);
});
