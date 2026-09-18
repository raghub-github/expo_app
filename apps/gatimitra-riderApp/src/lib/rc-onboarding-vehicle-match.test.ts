import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateRcOnboardingVehicleMatchClient,
  suggestOnboardingVehicleFromRcClient,
} from "./rc-onboarding-vehicle-match";
import type { OnboardingVehicleType } from "./onboarding-vehicle-types";

function vehicle(
  partial: Partial<OnboardingVehicleType> & Pick<OnboardingVehicleType, "code" | "onboardingFlow">,
): OnboardingVehicleType {
  return {
    id: 1,
    categoryCode: "2_wheeler",
    label: partial.label ?? partial.code,
    hint: null,
    icon: null,
    sortOrder: 1,
    isActive: true,
    documentRequirements: {},
    infoMessage: null,
    mapsToVehicleType: partial.code,
    ...partial,
  };
}

describe("rc-onboarding-vehicle-match client", () => {
  it("flags 4W selection vs 2W scooter RC", () => {
    const result = evaluateRcOnboardingVehicleMatchClient({
      vehicleChoice: "tata_ace",
      vehicleCategoryCode: "4_wheeler_non_ac",
      vehicleTypeLabel: "Tata Ace",
      onboardingFlow: "dl_rc",
      verifiedData: {
        vehicle_class: "M-Cycle/Scooter(2WN)",
        fuel_type: "PETROL(E20)",
      },
    });
    assert.equal(result.match, false);
    assert.equal(result.rcClass, "2_wheeler");
    assert.match(result.rcLabel, /Scooter|2 Wheeler/i);
    assert.equal(result.selectedLabel, "Tata Ace");
  });

  it("allows matching 2W petrol scooter RC", () => {
    const result = evaluateRcOnboardingVehicleMatchClient({
      vehicleChoice: "scooter",
      vehicleCategoryCode: "2_wheeler",
      vehicleTypeLabel: "Scooter",
      onboardingFlow: "dl_rc",
      verifiedData: {
        vehicle_class: "M-Cycle/Scooter(2WN)",
        fuel_type: "PETROL",
      },
    });
    assert.equal(result.match, true);
  });

  it("suggests scooter catalog row for 2W scooter RC", () => {
    const suggested = suggestOnboardingVehicleFromRcClient(
      { vehicle_class: "M-Cycle/Scooter(2WN)", fuel_type: "PETROL" },
      [
        vehicle({
          code: "tata_ace",
          categoryCode: "4_wheeler_non_ac",
          onboardingFlow: "dl_rc",
          label: "Tata Ace",
        }),
        vehicle({
          code: "scooter",
          categoryCode: "2_wheeler",
          onboardingFlow: "dl_rc",
          label: "Scooter",
        }),
      ],
    );
    assert.ok(suggested);
    assert.equal(suggested!.vehicleChoice, "scooter");
    assert.equal(suggested!.vehicleCategoryCode, "2_wheeler");
  });
});
