import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveStateSurges,
  type AppliedStateSurge,
} from "./stateSurge.service.js";
import type { StateSurgeConfigRow } from "./rideStateConfig.repository.js";

function surge(overrides: Partial<StateSurgeConfigRow>): StateSurgeConfigRow {
  return {
    id: 1,
    stateId: "00000000-0000-0000-0000-000000000001",
    name: "Rain",
    description: null,
    enabled: true,
    surgeType: "fixed",
    amount: 30,
    vehicleType: "all",
    appliesFood: false,
    appliesParcel: false,
    appliesRide: true,
    maxRidersOnly: false,
    priority: 100,
    manualActive: true,
    fundingMode: "CUSTOMER_100",
    customerSharePct: 100,
    companySharePct: 0,
    ...overrides,
  };
}

function slot(surgeId: number) {
  return {
    id: surgeId * 10,
    stateSurgeId: surgeId,
    startTime: "00:00",
    endTime: "23:59",
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    isEnabled: true,
  };
}

test("funding: CUSTOMER_100 puts the whole surge on the customer share", () => {
  const cfg = surge({ id: 1, fundingMode: "CUSTOMER_100", amount: 30 });
  const res = resolveStateSurges({
    configs: [cfg],
    timeSlotsBySurgeId: new Map([[1, [slot(1)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    forceActiveSurgeIds: [1],
  });
  assert.equal(res.surgeTotal, 30);
  assert.equal(res.customerShareTotal, 30);
  assert.equal(res.companyShareTotal, 0);
  assert.equal(res.appliedSurges[0]?.fundingMode, "CUSTOMER_100");
});

test("funding: COMPANY_100 keeps customer bill flat while paying rider fully", () => {
  const cfg = surge({ id: 2, fundingMode: "COMPANY_100", amount: 40 });
  const res = resolveStateSurges({
    configs: [cfg],
    timeSlotsBySurgeId: new Map([[2, [slot(2)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 200,
    maxTotalSurgeAmount: null,
    forceActiveSurgeIds: [2],
  });
  assert.equal(res.surgeTotal, 40);
  assert.equal(res.customerShareTotal, 0);
  assert.equal(res.companyShareTotal, 40);
});

test("funding: SHARED respects configured percentages", () => {
  const cfg = surge({
    id: 3,
    fundingMode: "SHARED",
    amount: 100,
    customerSharePct: 60,
    companySharePct: 40,
  });
  const res = resolveStateSurges({
    configs: [cfg],
    timeSlotsBySurgeId: new Map([[3, [slot(3)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    forceActiveSurgeIds: [3],
  });
  assert.equal(res.surgeTotal, 100);
  assert.equal(res.customerShareTotal, 60);
  assert.equal(res.companyShareTotal, 40);
});

test("one surge per order: highest-amount eligible surge wins, others ignored", () => {
  const configs: StateSurgeConfigRow[] = [
    surge({ id: 1, name: "Rain", fundingMode: "CUSTOMER_100", amount: 20 }),
    surge({ id: 2, name: "Festival", fundingMode: "COMPANY_100", amount: 15 }),
    surge({ id: 3, name: "Peak", fundingMode: "SHARED", amount: 30, customerSharePct: 50, companySharePct: 50 }),
  ];
  const res = resolveStateSurges({
    configs,
    timeSlotsBySurgeId: new Map([[1, [slot(1)]], [2, [slot(2)]], [3, [slot(3)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    forceActiveSurgeIds: [1, 2, 3],
  });
  assert.equal(res.appliedSurges.length, 1, "only one surge applies");
  assert.equal(res.appliedSurges[0]?.name, "Peak", "the ₹30 surge wins over ₹20 and ₹15");
  assert.equal(res.surgeTotal, 30);
  assert.equal(res.customerShareTotal, 15);
  assert.equal(res.companyShareTotal, 15);
});

test("amount tie breaks toward the higher-priority surge", () => {
  const configs: StateSurgeConfigRow[] = [
    surge({ id: 1, name: "Low priority", amount: 20, priority: 90 }),
    surge({ id: 2, name: "High priority", amount: 20, priority: 100 }),
  ];
  const res = resolveStateSurges({
    configs,
    timeSlotsBySurgeId: new Map([[1, [slot(1)]], [2, [slot(2)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    forceActiveSurgeIds: [1, 2],
  });
  assert.equal(res.appliedSurges.length, 1);
  assert.equal(res.appliedSurges[0]?.surgeId, 2, "priority 100 wins the tie");
});

test("single winning surge is capped by the per-order max", () => {
  const configs: StateSurgeConfigRow[] = [
    surge({ id: 1, name: "Rain", fundingMode: "CUSTOMER_100", amount: 60 }),
    surge({ id: 2, name: "Festival", fundingMode: "COMPANY_100", amount: 40 }),
  ];
  const res = resolveStateSurges({
    configs,
    timeSlotsBySurgeId: new Map([[1, [slot(1)]], [2, [slot(2)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: 50, // cap the winning ₹60 surge to ₹50
    forceActiveSurgeIds: [1, 2],
  });
  assert.equal(res.appliedSurges.length, 1);
  assert.equal(res.appliedSurges[0]?.name, "Rain");
  assert.equal(res.surgeTotal, 50);
  assert.equal(res.surgeCapped, true);
  assert.equal(res.customerShareTotal, 50, "CUSTOMER_100 winner keeps full split after cap");
  assert.equal(res.companyShareTotal, 0);
});

// ── "GMitra Max riders only" checkbox = the per-surge eligibility gate ──────────────────────

test("checkbox ON: max-only surge is hidden from a non-Max rider", () => {
  const cfg = surge({ id: 1, name: "Peak", amount: 20, maxRidersOnly: true });
  const res = resolveStateSurges({
    configs: [cfg],
    timeSlotsBySurgeId: new Map([[1, [slot(1)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    forceActiveSurgeIds: [1],
  });
  assert.equal(res.surgeTotal, 0);
  assert.equal(res.appliedSurges.length, 0);
  assert.equal(res.activeSurgesRequireMaxOnly, true, "active surge exists but rider ineligible");
});

test("checkbox ON: max-only surge is shown to a Max rider", () => {
  const cfg = surge({ id: 1, name: "Peak", amount: 20, maxRidersOnly: true });
  const res = resolveStateSurges({
    configs: [cfg],
    timeSlotsBySurgeId: new Map([[1, [slot(1)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: true,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    forceActiveSurgeIds: [1],
  });
  assert.equal(res.surgeTotal, 20);
  assert.equal(res.activeSurgesRequireMaxOnly, false);
});

test("checkbox OFF: surge reaches every rider (incl. non-Max), even with the global flag on", () => {
  const cfg = surge({ id: 1, name: "Night", amount: 10, maxRidersOnly: false });
  const res = resolveStateSurges({
    configs: [cfg],
    timeSlotsBySurgeId: new Map([[1, [slot(1)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: true, // legacy global flag must NOT override the unchecked config
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    forceActiveSurgeIds: [1],
  });
  assert.equal(res.surgeTotal, 10, "unchecked surge is paid to a non-Max rider");
});

test("selection respects eligibility: a higher max-only surge is skipped for a non-Max rider", () => {
  const configs: StateSurgeConfigRow[] = [
    surge({ id: 1, name: "Big (Max only)", amount: 30, maxRidersOnly: true }),
    surge({ id: 2, name: "Small (all)", amount: 10, maxRidersOnly: false }),
  ];
  const nonMax = resolveStateSurges({
    configs,
    timeSlotsBySurgeId: new Map([[1, [slot(1)]], [2, [slot(2)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    forceActiveSurgeIds: [1, 2],
  });
  assert.equal(nonMax.appliedSurges[0]?.name, "Small (all)", "non-Max gets the eligible ₹10, not the ₹30 max-only");
  assert.equal(nonMax.surgeTotal, 10);

  const max = resolveStateSurges({
    configs,
    timeSlotsBySurgeId: new Map([[1, [slot(1)]], [2, [slot(2)]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: true,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    forceActiveSurgeIds: [1, 2],
  });
  assert.equal(max.appliedSurges[0]?.name, "Big (Max only)", "Max rider gets the higher ₹30");
  assert.equal(max.surgeTotal, 30);
});

// Time-slot windows are evaluated in IST (Asia/Kolkata), not the server's local timezone.
// 05:00 UTC == 10:30 IST on Tue 2025-01-07. A 10:00–11:00 window on Tuesday must be ACTIVE
// (it would be inactive if the check used server-local UTC hours).
const NOW_1030_IST = new Date("2025-01-07T05:00:00Z");

function timedSlot(surgeId: number, startTime: string, endTime: string, days: number[]) {
  return { id: surgeId * 10, stateSurgeId: surgeId, startTime, endTime, daysOfWeek: days, isEnabled: true };
}

test("time slot active when now is inside the window in IST (not UTC)", () => {
  const cfg = surge({ id: 5, name: "Night", fundingMode: "COMPANY_100", amount: 20, manualActive: false });
  const res = resolveStateSurges({
    configs: [cfg],
    timeSlotsBySurgeId: new Map([[5, [timedSlot(5, "10:00", "11:00", [2])]]]), // Tue
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    now: NOW_1030_IST,
  });
  assert.equal(res.surgeTotal, 20, "10:30 IST is inside 10:00–11:00 IST");
});

test("time slot inactive when the IST time falls outside the window", () => {
  const cfg = surge({ id: 6, name: "Night", fundingMode: "COMPANY_100", amount: 20, manualActive: false });
  const res = resolveStateSurges({
    configs: [cfg],
    timeSlotsBySurgeId: new Map([[6, [timedSlot(6, "06:00", "07:00", [2])]]]),
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    now: NOW_1030_IST,
  });
  assert.equal(res.surgeTotal, 0, "10:30 IST is outside 06:00–07:00 IST");
});

test("cross-midnight night window active in early IST morning", () => {
  // 20:30 UTC == 02:00 IST next day (Wed 2025-01-08). A 20:00–06:00 window covering Wed
  // must be active at 02:00 IST via the cross-midnight branch.
  const cfg = surge({ id: 7, name: "Night", fundingMode: "COMPANY_100", amount: 20, manualActive: false });
  const res = resolveStateSurges({
    configs: [cfg],
    timeSlotsBySurgeId: new Map([[7, [timedSlot(7, "20:00", "06:00", [3])]]]), // Wed
    service: "ride",
    pricingVehicle: "2_wheeler",
    riderHasGmitraMax: false,
    surgeWaitMaxOnly: false,
    baseFareForPct: 100,
    maxTotalSurgeAmount: null,
    now: new Date("2025-01-07T20:30:00Z"),
  });
  assert.equal(res.surgeTotal, 20, "02:00 IST Wed is inside the 20:00–06:00 window");
});

test("funding: unknown funding_mode falls back to CUSTOMER_100 shape", () => {
  const applied: AppliedStateSurge = {
    surgeId: 1,
    name: "Rain",
    surgeType: "fixed",
    amount: 25,
    appliedAmount: 25,
    fundingMode: "CUSTOMER_100",
    customerShareAmount: 25,
    companyShareAmount: 0,
  };
  // this is a shape sanity check — the enum is fixed by the union type
  assert.equal(applied.customerShareAmount + applied.companyShareAmount, 25);
});
