import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessOnboardingBankAccountScreen,
  canAccessOnboardingPaymentScreen,
  resolveFirstIncompleteOnboardingStep,
  previousOnboardingRoute,
  canGoBackFromOnboardingRoute,
  onboardingStepMetaForRoute,
} from "./onboarding-routes";

describe("onboarding top-bar back navigation + step meta", () => {
  it("returns the previous step route for a mid-flow step", () => {
    assert.equal(previousOnboardingRoute("pan-selfie"), "/(onboarding)/aadhaar");
    assert.equal(previousOnboardingRoute("dl-rc"), "/(onboarding)/pan-selfie");
    assert.equal(previousOnboardingRoute("payment"), "/(onboarding)/bank-account");
  });

  it("normalises a route given with the group prefix or leading slash", () => {
    assert.equal(previousOnboardingRoute("/(onboarding)/pan-selfie"), "/(onboarding)/aadhaar");
    assert.equal(previousOnboardingRoute("(onboarding)/dl-rc"), "/(onboarding)/pan-selfie");
  });

  it("has no back target on the first step", () => {
    assert.equal(previousOnboardingRoute("language"), null);
    assert.equal(canGoBackFromOnboardingRoute("language"), false);
    assert.equal(canGoBackFromOnboardingRoute("aadhaar"), true);
  });

  it("returns null (not a crash) for an unknown route", () => {
    assert.equal(previousOnboardingRoute("something-else"), null);
  });

  it("gives a 1-based step number + label for the help ticket", () => {
    const aadhaar = onboardingStepMetaForRoute("aadhaar");
    assert.equal(aadhaar.number, 5);
    assert.equal(aadhaar.label, "Aadhaar & name");
    assert.ok(aadhaar.total >= 7);
    // routes outside the linear flow (e.g. pending) have no number but still a label
    const pending = onboardingStepMetaForRoute("pending");
    assert.equal(pending.number, null);
    assert.equal(pending.label, "Under review");
  });
});

describe("dashboard-completed onboarding steps", () => {
  it("skips DL/RC when the server already marked vehicle docs complete", () => {
    assert.equal(
      resolveFirstIncompleteOnboardingStep(
        ["aadhaar_name", "pan_selfie", "dl_rc"],
        "dl_rc",
        { bankAccountOnboardingDone: true },
      ),
      "payment",
    );
  });

  it("does not bounce to DL/RC just because local vehicleChoice is empty", () => {
    assert.equal(
      canAccessOnboardingBankAccountScreen({
        completedOnboardingSteps: ["aadhaar_name", "pan_selfie", "dl_rc"],
        vehicleOnboardingFlow: "dl_rc",
      }),
      true,
    );
    assert.equal(
      canAccessOnboardingPaymentScreen({
        completedOnboardingSteps: ["aadhaar_name", "pan_selfie", "dl_rc"],
        vehicleOnboardingFlow: "dl_rc",
        bankAccountOnboardingDone: true,
        skipBankAccountCheck: false,
      }),
      true,
    );
  });

  it("still requires Aadhaar before later steps", () => {
    assert.equal(
      resolveFirstIncompleteOnboardingStep(["pan_selfie", "dl_rc"], "dl_rc"),
      "aadhaar_name",
    );
  });
});
