import test from "node:test";
import assert from "node:assert/strict";
import { resolveRiderSurges } from "./riderSurge.service.js";
import type { SurgeDefinitionRow, SurgeTimeSlotRow } from "./types.js";

function peakDef(overrides: Partial<SurgeDefinitionRow> = {}): SurgeDefinitionRow {
  return {
    id: 1,
    name: "Peak Hour Surge",
    description: null,
    kind: "peak_hour",
    fixedAmount: 15,
    priority: 100,
    isEnabled: true,
    gmitraMaxOnly: false,
    appliesFood: true,
    appliesParcel: true,
    appliesRide: true,
    vehicle2Wheeler: true,
    vehicle3Wheeler: true,
    vehicle4WheelerAc: true,
    vehicle4WheelerNonAc: true,
    manualActive: false,
    ...overrides,
  };
}

test("peak hour surge active inside configured slot", () => {
  const slots: SurgeTimeSlotRow[] = [
    {
      id: 1,
      surgeId: 1,
      startTime: "07:00",
      endTime: "10:00",
      daysOfWeek: [1, 2, 3, 4, 5],
      isEnabled: true,
    },
  ];
  const now = new Date("2026-06-15T08:30:00");
  const res = resolveRiderSurges({
    definitions: [peakDef()],
    timeSlotsBySurgeId: new Map([[1, slots]]),
    service: "food",
    vehicleType: null,
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    maxTotalSurgeAmount: null,
    now,
  });
  assert.equal(res.appliedSurges.length, 1);
  assert.equal(res.surgeTotal, 15);
});

test("rain surge requires manual_active", () => {
  const resOff = resolveRiderSurges({
    definitions: [peakDef({ id: 2, kind: "rain", name: "Rain", manualActive: false })],
    timeSlotsBySurgeId: new Map(),
    service: "food",
    vehicleType: null,
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    maxTotalSurgeAmount: null,
  });
  assert.equal(resOff.appliedSurges.length, 0);

  const resOn = resolveRiderSurges({
    definitions: [peakDef({ id: 2, kind: "rain", name: "Rain", manualActive: true, fixedAmount: 10 })],
    timeSlotsBySurgeId: new Map(),
    service: "food",
    vehicleType: null,
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    maxTotalSurgeAmount: null,
  });
  assert.equal(resOn.surgeTotal, 10);
});

test("global surge_wait_max_only blocks all surges for non-Max riders", () => {
  const res = resolveRiderSurges({
    definitions: [peakDef({ kind: "custom", manualActive: true })],
    timeSlotsBySurgeId: new Map(),
    service: "food",
    vehicleType: null,
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: true,
    maxTotalSurgeAmount: null,
  });
  assert.equal(res.surgeTotal, 0);
});

test("multiple surges capped at max_total_surge_amount", () => {
  const res = resolveRiderSurges({
    definitions: [
      peakDef({ id: 1, kind: "custom", fixedAmount: 30 }),
      peakDef({ id: 2, kind: "custom", name: "B", fixedAmount: 30 }),
    ],
    timeSlotsBySurgeId: new Map(),
    service: "food",
    vehicleType: null,
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    maxTotalSurgeAmount: 50,
  });
  assert.equal(res.rawSurgeTotal, 60);
  assert.equal(res.surgeTotal, 50);
  assert.equal(res.surgeCapped, true);
});
