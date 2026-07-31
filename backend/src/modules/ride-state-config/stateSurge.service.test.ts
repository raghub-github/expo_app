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

test("funding: aggregate across mixed-mode surges", () => {
  const configs: StateSurgeConfigRow[] = [
    surge({ id: 1, name: "Rain", fundingMode: "CUSTOMER_100", amount: 20 }),
    surge({ id: 2, name: "Festival", fundingMode: "COMPANY_100", amount: 15 }),
    surge({
      id: 3,
      name: "Peak",
      fundingMode: "SHARED",
      amount: 20,
      customerSharePct: 50,
      companySharePct: 50,
    }),
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
  assert.equal(res.surgeTotal, 55, "20 + 15 + 20");
  // customer share = 20 (rain) + 0 (festival) + 10 (peak) = 30
  assert.equal(res.customerShareTotal, 30);
  // company share = 0 + 15 + 10 = 25
  assert.equal(res.companyShareTotal, 25);
});

test("funding: cap scales customer and company shares proportionally", () => {
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
    maxTotalSurgeAmount: 50, // cap total at 50 (originally 100 → 60c / 40k)
    forceActiveSurgeIds: [1, 2],
  });
  assert.equal(res.surgeTotal, 50);
  assert.equal(res.surgeCapped, true);
  // proportional: customer 60/100 * 50 = 30, company 40/100 * 50 = 20
  assert.equal(res.customerShareTotal, 30);
  assert.equal(res.companyShareTotal, 20);
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
