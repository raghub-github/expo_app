import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deriveVehicleDispatchServicesFromProfile,
  filterDispatchServicesForRiderProfile,
} from "./rider-dispatch-service-rules.js";

describe("rider-dispatch-service-rules", () => {
  it("2W profile derives all dispatch services", () => {
    assert.deepEqual(
      deriveVehicleDispatchServicesFromProfile({ vehicleTypes: ["bike"] }),
      ["food", "parcel", "person_ride"]
    );
  });

  it("3W profile derives parcel and ride only", () => {
    assert.deepEqual(
      deriveVehicleDispatchServicesFromProfile({ vehicleTypes: ["auto"] }),
      ["parcel", "person_ride"]
    );
  });

  it("strips food for 4W profile", () => {
    assert.deepEqual(
      filterDispatchServicesForRiderProfile(["food", "parcel", "person_ride"], {
        vehicleTypes: ["car"],
      }),
      ["parcel", "person_ride"]
    );
  });
});
