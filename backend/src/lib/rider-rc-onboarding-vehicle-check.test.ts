import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateRcOnboardingVehicleMatch,
  inferRcFuelKind,
} from "./rider-rc-onboarding-vehicle-check.js";

describe("rider-rc-onboarding-vehicle-check", () => {
  it("detects EV catalog vs petrol RC fuel mismatch", () => {
    const result = evaluateRcOnboardingVehicleMatch({
      vehicleChoice: "ev_bike",
      vehicleCategoryCode: "2_wheeler",
      onboardingFlow: "rental_ev",
      vehicleTypeLabel: "EV Bike",
      verifiedData: {
        vehicle_class: "M-Cycle/Scooter(2WN)",
        fuel_type: "PETROL",
      },
    });
    assert.equal(result.match, false);
    assert.equal(result.selectedElectric, true);
    assert.equal(result.rcFuel, "petrol");
  });

  it("allows matching 2W petrol bike RC", () => {
    const result = evaluateRcOnboardingVehicleMatch({
      vehicleChoice: "bike",
      vehicleCategoryCode: "2_wheeler",
      onboardingFlow: "dl_rc",
      vehicleTypeLabel: "Bike",
      verifiedData: {
        vehicle_class: "M-Cycle/Scooter(2WN)",
        fuel_type: "PETROL",
      },
    });
    assert.equal(result.match, true);
  });

  it("detects 4W vs 2W class mismatch", () => {
    const result = evaluateRcOnboardingVehicleMatch({
      vehicleChoice: "bike",
      vehicleCategoryCode: "2_wheeler",
      onboardingFlow: "dl_rc",
      verifiedData: { vehicle_class: "LMV", fuel_type: "PETROL" },
    });
    assert.equal(result.match, false);
    assert.equal(result.rcClass, "4_wheeler");
    assert.equal(result.selectedClass, "2_wheeler");
  });

  it("parses electric fuel from RC payload", () => {
    assert.equal(inferRcFuelKind({ fuel_type: "ELECTRIC(BOV)" }), "electric");
  });
});

describe("extractReusableRcVerifiedData", () => {
  it("returns cached Cashfree payload for the same RC plate", async () => {
    const { extractReusableRcVerifiedData } = await import(
      "./rider-rc-onboarding-vehicle-check.js"
    );
    const got = extractReusableRcVerifiedData({
      docNumber: "WB12AB1234",
      metadata: {
        cashfreeVerifiedData: {
          vehicle_class: "M-Cycle/Scooter(2WN)",
          fuel_type: "PETROL",
        },
      },
      requestedVehicleNumber: "WB12AB1234",
    });
    assert.ok(got);
    assert.equal(got!.plate, "WB12AB1234");
    assert.equal(got!.verifiedData.fuel_type, "PETROL");
  });

  it("returns null when plate differs or cache missing", async () => {
    const { extractReusableRcVerifiedData } = await import(
      "./rider-rc-onboarding-vehicle-check.js"
    );
    assert.equal(
      extractReusableRcVerifiedData({
        docNumber: "WB12AB1234",
        metadata: { cashfreeVerifiedData: { fuel_type: "PETROL" } },
        requestedVehicleNumber: "WB99ZZ9999",
      }),
      null,
    );
    assert.equal(
      extractReusableRcVerifiedData({
        docNumber: "WB12AB1234",
        metadata: {},
        requestedVehicleNumber: "WB12AB1234",
      }),
      null,
    );
  });
});
