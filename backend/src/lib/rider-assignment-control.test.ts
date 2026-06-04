import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateRiderAssignmentEligibility,
  type RiderActiveAssignmentCounts,
  type ServiceAssignmentLimitsConfig,
} from "./rider-assignment-control.js";

const defaultConfig: ServiceAssignmentLimitsConfig = {
  limits: {
    food: {
      serviceType: "food",
      maxActiveAssignments: 2,
      exclusiveMode: false,
      isActive: true,
    },
    parcel: {
      serviceType: "parcel",
      maxActiveAssignments: 2,
      exclusiveMode: false,
      isActive: true,
    },
    person_ride: {
      serviceType: "person_ride",
      maxActiveAssignments: 1,
      exclusiveMode: true,
      isActive: true,
    },
  },
  global: {
    allowCrossServiceAssignments: false,
    personRideExclusiveMode: true,
    isActive: true,
  },
};

describe("service assignment limits engine", () => {
  it("cross-service OFF: food at limit blocks more food and parcel", () => {
    const counts: RiderActiveAssignmentCounts = {
      food: 2,
      parcel: 0,
      person_ride: 0,
      total: 2,
    };
    assert.equal(
      evaluateRiderAssignmentEligibility(counts, "food", defaultConfig).eligible,
      false
    );
    assert.equal(
      evaluateRiderAssignmentEligibility(counts, "parcel", defaultConfig).eligible,
      false
    );
  });

  it("cross-service OFF: one food allows another food but not parcel", () => {
    const counts: RiderActiveAssignmentCounts = {
      food: 1,
      parcel: 0,
      person_ride: 0,
      total: 1,
    };
    assert.equal(
      evaluateRiderAssignmentEligibility(counts, "food", defaultConfig).eligible,
      true
    );
    assert.equal(
      evaluateRiderAssignmentEligibility(counts, "parcel", defaultConfig).eligible,
      false
    );
  });

  it("active person ride blocks all services", () => {
    const counts: RiderActiveAssignmentCounts = {
      food: 0,
      parcel: 0,
      person_ride: 1,
      total: 1,
    };
    assert.equal(
      evaluateRiderAssignmentEligibility(counts, "food", defaultConfig).eligible,
      false
    );
    assert.equal(
      evaluateRiderAssignmentEligibility(counts, "person_ride", defaultConfig).eligible,
      false
    );
  });

  it("active food blocks person ride", () => {
    const counts: RiderActiveAssignmentCounts = {
      food: 1,
      parcel: 0,
      person_ride: 0,
      total: 1,
    };
    assert.equal(
      evaluateRiderAssignmentEligibility(counts, "person_ride", defaultConfig).eligible,
      false
    );
  });

  it("cross-service ON: food and parcel can stack within caps", () => {
    const config: ServiceAssignmentLimitsConfig = {
      ...defaultConfig,
      global: { ...defaultConfig.global, allowCrossServiceAssignments: true },
    };
    const counts: RiderActiveAssignmentCounts = {
      food: 1,
      parcel: 0,
      person_ride: 0,
      total: 1,
    };
    assert.equal(evaluateRiderAssignmentEligibility(counts, "parcel", config).eligible, true);
  });
});
