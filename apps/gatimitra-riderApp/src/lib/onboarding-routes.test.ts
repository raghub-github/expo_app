import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessOnboardingBankAccountScreen,
  canAccessOnboardingPaymentScreen,
  resolveFirstIncompleteOnboardingStep,
} from "./onboarding-routes";

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
