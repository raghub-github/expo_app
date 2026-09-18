import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyRcManualReviewDecision,
  isRcAcceptableForOnboardingPayment,
  isRcBlockingOnboardingPayment,
  isRcCompleteForOnboardingProgress,
  isRcRealPhotoUrl,
  rcOwnerAadhaarNamesMatch,
  resolveRcSaveVerification,
  resolveRcVerificationState,
} from "./rider-rc-verification-state.js";

describe("rcOwnerAadhaarNamesMatch", () => {
  it("matches exact / case / spacing", () => {
    assert.equal(rcOwnerAadhaarNamesMatch("Rahul Kumar", "  RAHUL   KUMAR "), true);
  });

  it("matches containment and high token overlap", () => {
    assert.equal(rcOwnerAadhaarNamesMatch("Rahul Kumar Singh", "Rahul Kumar"), true);
    assert.equal(rcOwnerAadhaarNamesMatch("Rahul Singh", "Rahul K Singh"), true);
  });

  it("rejects unrelated names", () => {
    assert.equal(rcOwnerAadhaarNamesMatch("Amit Sharma", "Rahul Kumar"), false);
    assert.equal(rcOwnerAadhaarNamesMatch("", "Rahul"), false);
  });
});

describe("resolveRcVerificationState", () => {
  it("maps auto-verified Cashfree RC", () => {
    assert.equal(
      resolveRcVerificationState({
        fileUrl: "cashfree_rc_verified",
        verified: true,
        verificationMethod: "APP_VERIFIED",
        verificationStatus: "auto_verified",
      }),
      "AUTO_VERIFIED",
    );
  });

  it("maps mismatch photo to pending — never verified", () => {
    assert.equal(
      resolveRcVerificationState({
        fileUrl: "https://cdn.example/rc.jpg",
        verified: false,
        verificationMethod: "MANUAL_UPLOAD",
        verificationStatus: "pending",
        requiresManualReview: true,
        metadata: {
          rcOwnerAadhaarMismatch: true,
          rcVerificationState: "MANUAL_REVIEW_PENDING",
          documentVersion: 1,
        },
      }),
      "MANUAL_REVIEW_PENDING",
    );
  });

  it("maps admin approval and rejection", () => {
    assert.equal(
      resolveRcVerificationState({
        fileUrl: "https://cdn.example/rc.jpg",
        verified: true,
        verificationStatus: "approved",
        metadata: { rcOwnerAadhaarMismatch: true, rcVerificationState: "MANUAL_VERIFIED" },
      }),
      "MANUAL_VERIFIED",
    );
    assert.equal(
      resolveRcVerificationState({
        fileUrl: "https://cdn.example/rc.jpg",
        verified: false,
        verificationStatus: "rejected",
        rejectedReason: "Unreadable",
        metadata: { rcVerificationState: "MANUAL_REJECTED" },
      }),
      "MANUAL_REJECTED",
    );
  });
});

describe("RC payment / progress gates", () => {
  const usable = (doc?: { fileUrl?: string | null } | null) =>
    Boolean(doc?.fileUrl) && isRcRealPhotoUrl(doc?.fileUrl);

  it("allows payment while pending manual review; blocks rejected", () => {
    const pending = {
      fileUrl: "https://cdn.example/rc.jpg",
      verified: false,
      verificationStatus: "pending",
      metadata: { rcOwnerAadhaarMismatch: true, rcVerificationState: "MANUAL_REVIEW_PENDING" },
    };
    assert.equal(isRcBlockingOnboardingPayment(pending), false);
    assert.equal(isRcAcceptableForOnboardingPayment(pending), true);
    assert.equal(isRcCompleteForOnboardingProgress(pending, false, usable), true);
  });

  it("allows payment after auto or manual verify", () => {
    assert.equal(
      isRcAcceptableForOnboardingPayment({
        verified: true,
        verificationStatus: "auto_verified",
        verificationMethod: "APP_VERIFIED",
        fileUrl: "cashfree_rc_verified",
      }),
      true,
    );
    assert.equal(
      isRcAcceptableForOnboardingPayment({
        verified: true,
        verificationStatus: "approved",
        fileUrl: "https://cdn.example/rc.jpg",
        metadata: { rcVerificationState: "MANUAL_VERIFIED" },
      }),
      true,
    );
  });

  it("treats skipped RC as complete", () => {
    assert.equal(isRcCompleteForOnboardingProgress(null, true, usable), true);
    assert.equal(isRcBlockingOnboardingPayment(null, true), false);
  });
});

describe("resolveRcSaveVerification", () => {
  const cashfree = { owner: "Suresh Kumar", reg_no: "KA01AB1234", status: "VALID" };

  it("auto-verifies when owner matches Aadhaar", () => {
    const result = resolveRcSaveVerification({
      fileUrl: "cashfree_rc_verified",
      metadata: { verificationMethod: "cashfree_rc", verifiedDetails: cashfree },
      aadhaarName: "Suresh Kumar",
    });
    assert.equal(result.kind, "auto_verified");
    assert.equal(result.metadata.rcVerificationState, "AUTO_VERIFIED");
  });

  it("requires a photo instead of auto-verifying a mismatch stub", () => {
    const result = resolveRcSaveVerification({
      fileUrl: "cashfree_rc_verified",
      metadata: { verificationMethod: "cashfree_rc", verifiedDetails: cashfree },
      aadhaarName: "Rahul Singh",
    });
    assert.equal(result.kind, "photo_required");
  });

  it("sends mismatch photo to manual review, not verified", () => {
    const result = resolveRcSaveVerification({
      fileUrl: "https://cdn.example/rc.jpg",
      r2Key: "docs/rc.jpg",
      metadata: {
        verificationMethod: "cashfree_rc",
        verifiedDetails: cashfree,
        rcOwnerAadhaarMismatch: true,
      },
      aadhaarName: "Rahul Singh",
    });
    assert.equal(result.kind, "manual_review");
    assert.equal(result.metadata.rcVerificationState, "MANUAL_REVIEW_PENDING");
    assert.equal(result.metadata.rcOwnerAadhaarMismatch, true);
    assert.equal(result.metadata.verificationMethod, "manual_upload");
  });

  it("never auto-verifies a real RC photo even when Cashfree owner matches Aadhaar", () => {
    const result = resolveRcSaveVerification({
      fileUrl: "https://cdn.example/rc-match.jpg",
      r2Key: "docs/rc-match.jpg",
      metadata: {
        verificationMethod: "cashfree_rc",
        verifiedDetails: cashfree,
      },
      aadhaarName: "Suresh Kumar",
    });
    assert.equal(result.kind, "manual_review");
    assert.equal(result.metadata.rcVerificationState, "MANUAL_REVIEW_PENDING");
  });

  it("marks plain photo-only RC upload as manual review", () => {
    const result = resolveRcSaveVerification({
      fileUrl: "https://cdn.example/rc-manual.jpg",
      r2Key: "docs/rc-manual.jpg",
      metadata: { rcNumber: "KA01AB1234" },
      aadhaarName: "Suresh Kumar",
    });
    assert.equal(result.kind, "manual_review");
  });

  it("versions a re-upload after rejection", () => {
    const result = resolveRcSaveVerification({
      fileUrl: "https://cdn.example/rc-v2.jpg",
      r2Key: "docs/rc-v2.jpg",
      metadata: { verifiedDetails: cashfree, rcOwnerAadhaarMismatch: true },
      aadhaarName: "Rahul Singh",
      existing: {
        fileUrl: "https://cdn.example/rc-v1.jpg",
        r2Key: "docs/rc-v1.jpg",
        verified: false,
        verificationStatus: "rejected",
        rejectedReason: "Blurry",
        metadata: {
          rcVerificationState: "MANUAL_REJECTED",
          documentVersion: 1,
          rcOwnerAadhaarMismatch: true,
        },
      },
    });
    assert.equal(result.documentVersion, 2);
    assert.equal(result.kind, "manual_review");
    assert.equal((result.metadata.rcReviewHistory as { version: number }[]).length, 1);
    assert.equal((result.metadata.rcReviewHistory as { version: number }[])[0]?.version, 1);
  });

  it("never auto-verifies a Cashfree stub over an in-flight manual photo review", () => {
    const result = resolveRcSaveVerification({
      fileUrl: "cashfree_rc_verified",
      metadata: { verificationMethod: "cashfree_rc", verifiedDetails: cashfree },
      aadhaarName: "Suresh Kumar",
      existing: {
        fileUrl: "https://cdn.example/rc-pending.jpg",
        r2Key: "docs/rc-pending.jpg",
        verified: false,
        verificationMethod: "MANUAL_UPLOAD",
        verificationStatus: "pending",
        requiresManualReview: true,
        metadata: {
          rcOwnerAadhaarMismatch: true,
          rcVerificationState: "MANUAL_REVIEW_PENDING",
          documentVersion: 1,
          cashfreeVerifiedData: cashfree,
        },
      },
    });
    assert.equal(result.kind, "manual_review");
    assert.equal(result.metadata.rcVerificationState, "MANUAL_REVIEW_PENDING");
  });
});

describe("applyRcManualReviewDecision", () => {
  const pending = {
    fileUrl: "https://cdn.example/rc.jpg",
    verified: false,
    verificationStatus: "pending" as const,
    metadata: {
      rcVerificationState: "MANUAL_REVIEW_PENDING",
      documentVersion: 2,
      rcOwnerAadhaarMismatch: true,
    },
  };

  it("approves only the active version", () => {
    const ok = applyRcManualReviewDecision({
      existing: pending,
      action: "approve",
      agentId: 9,
      expectedDocumentVersion: 2,
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.newStatus, "MANUAL_VERIFIED");
      assert.equal(ok.previousStatus, "MANUAL_REVIEW_PENDING");
    }
  });

  it("rejects stale version approval", () => {
    const stale = applyRcManualReviewDecision({
      existing: pending,
      action: "approve",
      agentId: 9,
      expectedDocumentVersion: 1,
    });
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.error, "DOCUMENT_VERSION_STALE");
  });

  it("rejects an already verified RC", () => {
    const again = applyRcManualReviewDecision({
      existing: {
        ...pending,
        verified: true,
        verificationStatus: "approved",
        metadata: { ...pending.metadata, rcVerificationState: "MANUAL_VERIFIED" },
      },
      action: "approve",
      agentId: 9,
      expectedDocumentVersion: 2,
    });
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.error, "ALREADY_DECISIONED");
  });
});
