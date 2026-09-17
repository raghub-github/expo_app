import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAccessOnboardingBankAccountScreen,
  canAccessOnboardingPaymentScreen,
  canAccessHomeTabs,
  isRiderWaitingForOnboardingReview,
  resolveEstablishedRiderHref,
  resolveFirstIncompleteOnboardingStep,
  resolveNewRiderDocsEntryHref,
  resolveOnboardingHref,
  resolveOnboardingRouteFromServer,
  previousOnboardingRoute,
  nextOnboardingRoute,
  canGoBackFromOnboardingRoute,
  onboardingStepMetaForRoute,
} from "./onboarding-routes";

describe("onboarding top-bar back navigation + step meta", () => {
  it("returns the previous step route for a mid-flow step", () => {
    assert.equal(previousOnboardingRoute("pan-selfie"), "/(onboarding)/aadhaar");
    assert.equal(previousOnboardingRoute("dl-rc"), "/(onboarding)/pan-selfie?walk=1");
    assert.equal(
      previousOnboardingRoute("bank-account"),
      "/(onboarding)/dl-rc?walk=1&step=last_doc",
    );
    assert.equal(
      previousOnboardingRoute("bank-account", { vehicleOnboardingFlow: "rental_ev" }),
      "/(onboarding)/rental-ev?walk=1",
    );
    assert.equal(
      previousOnboardingRoute("rental-ev"),
      "/(onboarding)/dl-rc?walk=1&step=last_doc",
    );
    assert.equal(previousOnboardingRoute("payment"), "/(onboarding)/bank-account?walk=1");
  });

  it("Continue walks the next adjacent step (never furthest pending)", () => {
    assert.equal(nextOnboardingRoute("location"), "/(onboarding)/aadhaar");
    assert.equal(nextOnboardingRoute("aadhaar"), "/(onboarding)/pan-selfie?walk=1");
    assert.equal(nextOnboardingRoute("pan-selfie"), "/(onboarding)/dl-rc");
    assert.equal(nextOnboardingRoute("dl-rc"), "/(onboarding)/bank-account");
    assert.equal(
      nextOnboardingRoute("dl-rc", { vehicleOnboardingFlow: "rental_ev" }),
      "/(onboarding)/rental-ev?doc=rental_proof",
    );
    assert.equal(nextOnboardingRoute("rental-ev"), "/(onboarding)/bank-account");
    assert.equal(nextOnboardingRoute("bank-account"), "/(onboarding)/payment");
  });

  it("normalises a route given with the group prefix or leading slash", () => {
    assert.equal(previousOnboardingRoute("/(onboarding)/pan-selfie"), "/(onboarding)/aadhaar");
    assert.equal(previousOnboardingRoute("(onboarding)/dl-rc"), "/(onboarding)/pan-selfie?walk=1");
    assert.equal(nextOnboardingRoute("/(onboarding)/location"), "/(onboarding)/aadhaar");
  });

  it("has no back target on the first step", () => {
    assert.equal(previousOnboardingRoute("language"), null);
    assert.equal(canGoBackFromOnboardingRoute("language"), false);
    assert.equal(canGoBackFromOnboardingRoute("location"), false);
    assert.equal(canGoBackFromOnboardingRoute("pan-selfie"), true);
  });

  it("allows Aadhaar back to work location", () => {
    assert.equal(previousOnboardingRoute("aadhaar"), "/(onboarding)/location");
    assert.equal(canGoBackFromOnboardingRoute("aadhaar"), true);
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

  it("allows payment while RC is pending manual review; blocks rejected / name-mismatch", () => {
    const base = {
      completedOnboardingSteps: ["aadhaar_name", "pan_selfie", "dl_rc"],
      vehicleOnboardingFlow: "dl_rc" as const,
      bankAccountOnboardingDone: true,
    };
    assert.equal(
      canAccessOnboardingPaymentScreen({
        ...base,
        rcVerificationState: "MANUAL_REVIEW_PENDING",
      }),
      true,
    );
    assert.equal(
      canAccessOnboardingPaymentScreen({
        ...base,
        rcVerificationState: "MANUAL_REJECTED",
      }),
      false,
    );
    assert.equal(
      canAccessOnboardingPaymentScreen({
        ...base,
        rcVerificationState: "NAME_MISMATCH",
      }),
      false,
    );
    assert.equal(
      canAccessOnboardingPaymentScreen({
        ...base,
        rcVerificationState: "AUTO_VERIFIED",
      }),
      true,
    );
    assert.equal(
      canAccessOnboardingPaymentScreen({
        ...base,
        rcVerificationState: "MANUAL_VERIFIED",
      }),
      true,
    );
    assert.equal(
      resolveOnboardingRouteFromServer("payment", {
        ...base,
        rcVerificationState: "MANUAL_REVIEW_PENDING",
      }),
      "/(onboarding)/payment",
    );
    assert.equal(
      resolveFirstIncompleteOnboardingStep(["aadhaar_name", "pan_selfie", "dl_rc"], "dl_rc", {
        bankAccountOnboardingDone: true,
        rcVerificationState: "MANUAL_REJECTED",
      }),
      "dl_rc",
    );
  });

  it("still requires Aadhaar before later steps", () => {
    assert.equal(
      resolveFirstIncompleteOnboardingStep(["pan_selfie", "dl_rc"], "dl_rc"),
      "aadhaar_name",
    );
  });

  it("does not resume at DL/RC after optional skip was submitted", () => {
    assert.equal(
      resolveOnboardingRouteFromServer("dl_rc", {
        vehicleChoice: "bike",
        vehicleOnboardingSubmittedFor: "bike",
        vehicleOnboardingFlow: "dl_rc",
        bankAccountOnboardingDone: true,
        completedOnboardingSteps: ["aadhaar_name", "pan_selfie"],
      }),
      "/(onboarding)/payment",
    );
    assert.equal(
      resolveOnboardingRouteFromServer("dl_rc", {
        vehicleChoice: "bike",
        vehicleOnboardingSubmittedFor: "bike",
        vehicleOnboardingFlow: "dl_rc",
        bankAccountOnboardingDone: false,
        completedOnboardingSteps: ["aadhaar_name", "pan_selfie"],
      }),
      "/(onboarding)/bank-account",
    );
  });
});

describe("work location before Aadhaar", () => {
  it("routes new riders referral → location → aadhaar", () => {
    assert.equal(resolveNewRiderDocsEntryHref({}), "/(onboarding)/referral");
    assert.equal(
      resolveNewRiderDocsEntryHref({ referralPromptHandled: true }),
      "/(onboarding)/location",
    );
    assert.equal(
      resolveNewRiderDocsEntryHref({
        referralPromptHandled: true,
        workLocationConfirmed: true,
      }),
      "/(onboarding)/aadhaar",
    );
  });

  it("still shows location once even if Aadhaar was completed earlier", () => {
    assert.equal(
      resolveNewRiderDocsEntryHref({
        completedOnboardingSteps: ["aadhaar_name"],
        referralPromptHandled: false,
        workLocationConfirmed: false,
      }),
      "/(onboarding)/location",
    );
  });

  it("resumes mid-onboarding after work location is confirmed", () => {
    assert.equal(
      resolveOnboardingHref("in_progress", "pan_selfie", "pan_selfie", {
        completedOnboardingSteps: ["aadhaar_name"],
        referralPromptHandled: true,
        workLocationConfirmed: true,
      }),
      "/(onboarding)/pan-selfie",
    );
  });

  it("inserts location before resume when mid-onboarding lacks work location", () => {
    assert.equal(
      resolveOnboardingHref("in_progress", "pan_selfie", "pan_selfie", {
        completedOnboardingSteps: ["aadhaar_name", "pan_selfie"],
        referralPromptHandled: true,
        workLocationConfirmed: false,
      }),
      "/(onboarding)/location",
    );
  });
});

describe("waiting for review → home (not full pending page)", () => {
  it("routes paid pending_approval riders to home tabs", () => {
    assert.equal(
      resolveEstablishedRiderHref("pending_approval", "PENDING", null, {
        paymentCompleted: true,
      }),
      "/(tabs)/orders",
    );
    assert.equal(
      resolveOnboardingHref("pending_approval", "payment", "payment", {
        paymentCompleted: true,
        workLocationConfirmed: true,
        referralPromptHandled: true,
      }),
      "/(tabs)/orders",
    );
  });

  it("allows tabs access while waiting for review", () => {
    assert.equal(canAccessHomeTabs("pending_approval", "PENDING", true), true);
    assert.equal(canAccessHomeTabs("pending_approval", "PENDING", false), false);
    assert.equal(
      isRiderWaitingForOnboardingReview({
        onboardingStatus: "pending_approval",
        accountStatus: "PENDING",
        paymentCompleted: true,
      }),
      true,
    );
    assert.equal(
      isRiderWaitingForOnboardingReview({
        onboardingStatus: "pending_approval",
        accountStatus: "ACTIVE",
        paymentCompleted: true,
      }),
      false,
    );
  });
});
