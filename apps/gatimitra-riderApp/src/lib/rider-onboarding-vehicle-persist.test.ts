import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  categoryActuallyChanged,
  shouldClearVehicleTypeOnCategoryContinue,
  vehicleTypeSelectionChanged,
} from "./rider-onboarding-vehicle-persist";

describe("rider-onboarding-vehicle-persist", () => {
  it("does not clear vehicle type when category Continue repeats the same category", () => {
    assert.equal(
      shouldClearVehicleTypeOnCategoryContinue({
        prevCategory: "2_wheeler",
        nextCategory: "2_wheeler",
        prevVehicleChoice: "ev_bike",
        prevVehicleCategory: "2_wheeler",
      }),
      false,
    );
  });

  it("clears vehicle type when category actually changes", () => {
    assert.equal(
      shouldClearVehicleTypeOnCategoryContinue({
        prevCategory: "2_wheeler",
        nextCategory: "4_wheeler_ac",
        prevVehicleChoice: "ev_bike",
        prevVehicleCategory: "2_wheeler",
      }),
      true,
    );
    assert.equal(categoryActuallyChanged("2_wheeler", "4_wheeler_ac"), true);
  });

  it("clears stale vehicle when persisted type belongs to another category", () => {
    assert.equal(
      shouldClearVehicleTypeOnCategoryContinue({
        prevCategory: "4_wheeler_ac",
        nextCategory: "4_wheeler_ac",
        prevVehicleChoice: "bike",
        prevVehicleCategory: "2_wheeler",
      }),
      true,
    );
  });

  it("detects vehicle type selection changes for RC revalidation", () => {
    assert.equal(vehicleTypeSelectionChanged("ev_bike", "scooter"), true);
    assert.equal(vehicleTypeSelectionChanged("ev_bike", "ev_bike"), false);
    assert.equal(vehicleTypeSelectionChanged(undefined, "ev_bike"), false);
  });
});
