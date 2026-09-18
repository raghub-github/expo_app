import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveRiderOnboardingStageTransition } from "./rider-onboarding-stage-machine.js";

describe("resolveRiderOnboardingStageTransition", () => {
  it("does not set ACTIVE or KYC APPROVED while vehicle docs still need review", () => {
    const next = resolveRiderOnboardingStageTransition({
      currentStage: "PAYMENT",
      currentKyc: "PENDING",
      currentStatus: "INACTIVE",
      identitySubmitted: true,
      identityVerified: true,
      vehicleReady: true,
      vehicleVerified: false,
      paymentCompleted: true,
    });
    assert.equal(next.onboardingStage, "APPROVAL");
    assert.equal(next.kycStatus, "REVIEW");
    assert.equal(next.status, "INACTIVE");
  });

  it("demotes wrongly ACTIVE riders when onboarding docs are still pending", () => {
    const next = resolveRiderOnboardingStageTransition({
      currentStage: "ACTIVE",
      currentKyc: "APPROVED",
      currentStatus: "ACTIVE",
      identitySubmitted: true,
      identityVerified: true,
      vehicleReady: true,
      vehicleVerified: false,
      paymentCompleted: true,
    });
    assert.equal(next.onboardingStage, "APPROVAL");
    assert.equal(next.kycStatus, "REVIEW");
    assert.equal(next.status, "INACTIVE");
    assert.equal(next.changed, true);
  });

  it("activates only when payment is done and all docs are verified", () => {
    const next = resolveRiderOnboardingStageTransition({
      currentStage: "APPROVAL",
      currentKyc: "REVIEW",
      currentStatus: "INACTIVE",
      identitySubmitted: true,
      identityVerified: true,
      vehicleReady: true,
      vehicleVerified: true,
      paymentCompleted: true,
    });
    assert.equal(next.onboardingStage, "ACTIVE");
    assert.equal(next.kycStatus, "APPROVED");
    assert.equal(next.status, "ACTIVE");
  });

  it("keeps ACTIVE when docs are fully verified", () => {
    const next = resolveRiderOnboardingStageTransition({
      currentStage: "ACTIVE",
      currentKyc: "APPROVED",
      currentStatus: "ACTIVE",
      identitySubmitted: true,
      identityVerified: true,
      vehicleReady: true,
      vehicleVerified: true,
      paymentCompleted: true,
    });
    assert.equal(next.onboardingStage, "ACTIVE");
    assert.equal(next.kycStatus, "APPROVED");
    assert.equal(next.status, "ACTIVE");
    assert.equal(next.changed, false);
  });
});
