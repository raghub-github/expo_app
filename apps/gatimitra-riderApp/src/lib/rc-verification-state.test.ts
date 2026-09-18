import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isRcAcceptableForOnboardingPayment,
  isRcApprovedForVehicleSheet,
  isRcBlockingOnboardingPayment,
  isRcManualReviewPending,
  isRcRejectedOrNeedsReupload,
} from "./rc-verification-state";

describe("rider RC payment eligibility", () => {
  it("does not block payment for pending manual review; blocks rejected and name-mismatch", () => {
    assert.equal(isRcBlockingOnboardingPayment("MANUAL_REVIEW_PENDING"), false);
    assert.equal(isRcBlockingOnboardingPayment("MANUAL_REJECTED"), true);
    assert.equal(isRcBlockingOnboardingPayment("NAME_MISMATCH"), true);
    assert.equal(isRcAcceptableForOnboardingPayment("MANUAL_REVIEW_PENDING"), true);
    assert.equal(isRcAcceptableForOnboardingPayment("MANUAL_REJECTED"), false);
  });

  it("allows payment after auto or manual verification", () => {
    assert.equal(isRcBlockingOnboardingPayment("AUTO_VERIFIED"), false);
    assert.equal(isRcBlockingOnboardingPayment("MANUAL_VERIFIED"), false);
    assert.equal(isRcAcceptableForOnboardingPayment("AUTO_VERIFIED"), true);
    assert.equal(isRcAcceptableForOnboardingPayment("MANUAL_VERIFIED"), true);
  });

  it("gates vehicle-complete sheet until RC is approved", () => {
    assert.equal(isRcApprovedForVehicleSheet("MANUAL_REVIEW_PENDING"), false);
    assert.equal(isRcApprovedForVehicleSheet("MANUAL_REJECTED"), false);
    assert.equal(isRcApprovedForVehicleSheet("NAME_MISMATCH"), false);
    assert.equal(isRcApprovedForVehicleSheet("AUTO_VERIFIED"), true);
    assert.equal(isRcApprovedForVehicleSheet("MANUAL_VERIFIED"), true);
    assert.equal(isRcManualReviewPending("MANUAL_REVIEW_PENDING"), true);
    assert.equal(isRcRejectedOrNeedsReupload("MANUAL_REJECTED"), true);
    assert.equal(isRcRejectedOrNeedsReupload("NAME_MISMATCH"), true);
  });
});
