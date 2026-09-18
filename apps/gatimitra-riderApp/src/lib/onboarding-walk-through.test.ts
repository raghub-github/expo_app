import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  onboardingContinueHref,
  parseOnboardingWalkParam,
  withOnboardingWalkParam,
} from "./onboarding-walk-through";

describe("onboarding walk-through", () => {
  it("parses walk query flags", () => {
    assert.equal(parseOnboardingWalkParam("1"), true);
    assert.equal(parseOnboardingWalkParam(["true"]), true);
    assert.equal(parseOnboardingWalkParam(undefined), false);
  });

  it("appends walk=1 once", () => {
    assert.equal(
      withOnboardingWalkParam("/(onboarding)/dl-rc"),
      "/(onboarding)/dl-rc?walk=1"
    );
    assert.equal(
      withOnboardingWalkParam("/(onboarding)/pan-selfie?step=selfie"),
      "/(onboarding)/pan-selfie?step=selfie&walk=1"
    );
  });

  it("Continue uses adjacent route with optional walk", () => {
    assert.equal(
      onboardingContinueHref("aadhaar", { walk: true }),
      "/(onboarding)/pan-selfie?walk=1"
    );
    assert.equal(
      onboardingContinueHref("dl-rc", {
        vehicleOnboardingFlow: "rental_ev",
        walk: true,
      }),
      "/(onboarding)/rental-ev?walk=1"
    );
  });
});
