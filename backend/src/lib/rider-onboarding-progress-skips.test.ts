import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isOnboardingDocSkipped,
  normalizeOnboardingDocCode,
  vehicleStepCompleteByRequired,
} from "./rider-onboarding-progress-docs.js";

describe("optional DL/RC skip for onboarding progress", () => {
  it("normalizes geo and catalog document codes", () => {
    assert.equal(normalizeOnboardingDocCode("DRIVING_LICENSE"), "dl");
    assert.equal(normalizeOnboardingDocCode("driving_licence"), "dl");
    assert.equal(normalizeOnboardingDocCode("dl"), "dl");
    assert.equal(normalizeOnboardingDocCode("REGISTRATION_CERTIFICATE"), "rc");
    assert.equal(normalizeOnboardingDocCode("rc"), "rc");
  });

  it("matches skipped codes across naming variants", () => {
    assert.equal(isOnboardingDocSkipped(["dl"], "DRIVING_LICENSE"), true);
    assert.equal(isOnboardingDocSkipped(["DRIVING_LICENSE"], "dl"), true);
    assert.equal(isOnboardingDocSkipped(["rc"], "REGISTRATION_CERTIFICATE"), true);
    assert.equal(isOnboardingDocSkipped(["dl"], "rc"), false);
  });

  it("treats skipped required DL+RC as satisfied for onboarding funnel", () => {
    assert.equal(
      vehicleStepCompleteByRequired([], ["dl", "rc"], ["dl", "rc"]),
      true,
    );
  });

  it("requires present DL when only RC was skipped", () => {
    assert.equal(
      vehicleStepCompleteByRequired([], ["dl", "rc"], ["rc"]),
      false,
    );
    assert.equal(
      vehicleStepCompleteByRequired(
        [{ docType: "dl", fileUrl: "https://cdn/dl.jpg", verified: false }],
        ["dl", "rc"],
        ["rc"],
      ),
      true,
    );
  });

  it("requires present RC when only DL was skipped", () => {
    assert.equal(
      vehicleStepCompleteByRequired(
        [{ docType: "rc", fileUrl: "https://cdn/rc.jpg", verified: false }],
        ["dl", "rc"],
        ["dl"],
      ),
      true,
    );
    assert.equal(
      vehicleStepCompleteByRequired([], ["dl", "rc"], ["dl"]),
      false,
    );
  });

  it("does not treat missing required docs as complete without skips", () => {
    assert.equal(vehicleStepCompleteByRequired([], ["dl", "rc"], []), false);
  });
});
