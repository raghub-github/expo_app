import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentNeedsManualOnboardingReview } from "./onboarding-verification-pending-ticket.js";

describe("documentNeedsManualOnboardingReview", () => {
  it("returns false for Cashfree auto-verified docs", () => {
    assert.equal(
      documentNeedsManualOnboardingReview({
        docType: "rc",
        fileUrl: "cashfree_rc_verified",
        r2Key: null,
        verified: true,
        verificationMethod: "CASHFREE_RC",
        verificationStatus: "auto_verified",
        requiresManualReview: false,
        metadata: { rcVerificationState: "AUTO_VERIFIED" },
      }),
      false,
    );
  });

  it("returns true for RC pending manual review after photo upload", () => {
    assert.equal(
      documentNeedsManualOnboardingReview({
        docType: "rc",
        fileUrl: "https://cdn.example/rc.jpg",
        r2Key: "riders/1/rc.jpg",
        verified: false,
        verificationMethod: "MANUAL_UPLOAD",
        verificationStatus: "pending",
        requiresManualReview: true,
        metadata: {
          rcOwnerAadhaarMismatch: true,
          rcVerificationState: "MANUAL_REVIEW_PENDING",
        },
      }),
      true,
    );
  });

  it("returns false for rejected docs", () => {
    assert.equal(
      documentNeedsManualOnboardingReview({
        docType: "rc",
        fileUrl: "https://cdn.example/rc.jpg",
        r2Key: null,
        verified: false,
        verificationMethod: "MANUAL_UPLOAD",
        verificationStatus: "rejected",
        requiresManualReview: true,
        metadata: { rcVerificationState: "MANUAL_REJECTED" },
      }),
      false,
    );
  });

  it("returns true for unverified Cashfree docs still pending (not only manual uploads)", () => {
    assert.equal(
      documentNeedsManualOnboardingReview({
        docType: "rc",
        fileUrl: "cashfree_rc_pending",
        r2Key: null,
        verified: false,
        verificationMethod: "CASHFREE_RC",
        verificationStatus: "pending",
        requiresManualReview: false,
        metadata: {},
      }),
      true,
    );
  });

  it("ignores skipped optional docs and second-vehicle RC uploads", () => {
    assert.equal(
      documentNeedsManualOnboardingReview(
        {
          docType: "dl",
          fileUrl: "https://cdn.example/dl.jpg",
          r2Key: "riders/1/dl.jpg",
          verified: false,
          verificationMethod: "MANUAL_UPLOAD",
          verificationStatus: "pending",
          requiresManualReview: true,
          metadata: {},
        },
        { skippedDocs: ["dl"] },
      ),
      false,
    );
    assert.equal(
      documentNeedsManualOnboardingReview({
        docType: "rc",
        fileUrl: "https://cdn.example/rc2.jpg",
        r2Key: "riders/1/rc2.jpg",
        verified: false,
        verificationMethod: "MANUAL_UPLOAD",
        verificationStatus: "pending",
        requiresManualReview: true,
        metadata: {
          addAnotherVehicle: true,
          rcVerificationState: "MANUAL_REVIEW_PENDING",
        },
      }),
      false,
    );
  });
});
