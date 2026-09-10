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
    assert.equal(previousOnboardingRoute("bank-account"), "/(onboarding)/dl-rc");
    assert.equal(previousOnboardingRoute("rental-ev"), "/(onboarding)/dl-rc");
    assert.equal(previousOnboardingRoute("payment"), "/(onboarding)/bank-account");
  });

  it("normalises a route given with the group prefix or leading slash", () => {
    assert.equal(previousOnboardingRoute("/(onboarding)/pan-selfie"), "/(onboarding)/aadhaar");
    assert.equal(previousOnboardingRoute("(onboarding)/dl-rc"), "/(onboarding)/pan-selfie");
  });

  it("has no back target on the first step", () => {
    assert.equal(previousOnboardingRoute("language"), null);
    assert.equal(canGoBackFromOnboardingRoute("language"), false);
    // Aadhaar is first KYC step — header back is hidden even if referral precedes it.
    assert.equal(canGoBackFromOnboardingRoute("aadhaar"), false);
    assert.equal(canGoBackFromOnboardingRoute("pan-selfie"), true);
  });

  it("returns null (not a crash) for an unknown route", () => {
    assert.equal(previousOnboardingRoute("something-else"), null);
  });

  it("gives KYC step numbers matching on-screen pills (not full 11-route flow)", () => {
    const aadhaar = onboardingStepMetaForRoute("aadhaar");
    assert.equal(aadhaar.number, 1);
    assert.equal(aadhaar.total, 6);
    assert.equal(aadhaar.label, "Aadhaar & name");

    const pan = onboardingStepMetaForRoute("pan-selfie");
    assert.equal(pan.number, 2);
    assert.equal(pan.label, "PAN & selfie");

    const rental = onboardingStepMetaForRoute("rental-ev");
    assert.equal(rental.number, 3);

    // Pre-KYC routes have a label but no verification step number
    const language = onboardingStepMetaForRoute("language");
    assert.equal(language.number, null);
    assert.equal(language.label, "Language");

    const pending = onboardingStepMetaForRoute("pending");
    assert.equal(pending.number, 6);
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
