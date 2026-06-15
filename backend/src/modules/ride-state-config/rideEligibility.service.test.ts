import test from "node:test";
import assert from "node:assert/strict";
import { isCatalogOptionEligibleForTrip } from "./rideEligibility.service.js";
import type { RideVehicleLimitRow } from "./rideStateConfig.repository.js";

const biharLimits: RideVehicleLimitRow[] = [
  {
    id: 1,
    stateId: "state-bihar",
    vehicleType: "2_wheeler",
    maxDistanceKm: 15,
    isEnabled: true,
  },
  {
    id: 2,
    stateId: "state-bihar",
    vehicleType: "3_wheeler",
    maxDistanceKm: 25,
    isEnabled: true,
  },
];

test("ride eligibility: hides bike when trip exceeds 2W limit", () => {
  assert.equal(
    isCatalogOptionEligibleForTrip({ catalogCode: "bike", tripKm: 18, limits: biharLimits }),
    false
  );
  assert.equal(
    isCatalogOptionEligibleForTrip({ catalogCode: "auto", tripKm: 18, limits: biharLimits }),
    true
  );
});

test("ride eligibility: no limit configured means vehicle stays visible", () => {
  assert.equal(
    isCatalogOptionEligibleForTrip({ catalogCode: "cab-economy", tripKm: 80, limits: biharLimits }),
    true
  );
});

test("ride eligibility: blank limit (no row) allows long inter-state trip", () => {
  assert.equal(
    isCatalogOptionEligibleForTrip({ catalogCode: "bike", tripKm: 1200, limits: [] }),
    true
  );
});

test("ride eligibility: disabled cap treated as unlimited", () => {
  const limits: RideVehicleLimitRow[] = [
    {
      id: 1,
      stateId: "x",
      vehicleType: "2_wheeler",
      maxDistanceKm: 15,
      isEnabled: false,
    },
  ];
  assert.equal(
    isCatalogOptionEligibleForTrip({ catalogCode: "bike", tripKm: 500, limits }),
    true
  );
});

test("ride eligibility: exact max distance is allowed", () => {
  assert.equal(
    isCatalogOptionEligibleForTrip({ catalogCode: "bike", tripKm: 15, limits: biharLimits }),
    true
  );
});
