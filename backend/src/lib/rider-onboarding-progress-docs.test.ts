import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aadhaarOnboardingComplete,
  adminCompletedVehicleOnboarding,
  bankAccountOnboardingCompleteFromDocs,
  dlRcOnboardingComplete,
  isOnboardingDocUsable,
  panSelfieOnboardingComplete,
} from "./rider-onboarding-progress-docs.js";

describe("rider onboarding docs from dashboard", () => {
  it("does not treat pending stubs as complete", () => {
    assert.equal(
      isOnboardingDocUsable({
        docType: "dl",
        fileUrl: "pending",
        verified: false,
      }),
      false,
    );
    assert.equal(
      dlRcOnboardingComplete([
        { docType: "dl", fileUrl: "pending", verified: false },
        { docType: "rc", fileUrl: "pending", verified: false },
      ]),
      false,
    );
  });

  it("treats dashboard electronic Aadhaar (verified, no back) as complete", () => {
    const emptyFiles = new Map<number, { side: string | null }[]>();
    assert.equal(
      aadhaarOnboardingComplete(
        [
          {
            id: 1,
            docType: "aadhaar",
            fileUrl: "electronic_verified",
            verified: true,
            verificationMethod: "CASHFREE_AUTO",
          },
        ],
        emptyFiles,
      ),
      true,
    );
  });

  it("treats front-only sideVerification without a back file as complete", () => {
    assert.equal(
      aadhaarOnboardingComplete(
        [
          {
            id: 9,
            docType: "aadhaar",
            fileUrl: "pending",
            verified: false,
            metadata: {
              sideVerification: { front: { verified: true, verificationStatus: "approved" } },
            },
          },
        ],
        new Map(),
      ),
      true,
    );
  });

  it("still requires both photo sides for unverified composite Aadhaar", () => {
    const files = new Map<number, { side: string | null }[]>([
      [1, [{ side: "front" }]],
    ]);
    assert.equal(
      aadhaarOnboardingComplete(
        [{ id: 1, docType: "aadhaar", fileUrl: "https://cdn/front.jpg", verified: false }],
        files,
      ),
      false,
    );
  });

  it("completes DL/RC when dashboard verifies both docs", () => {
    assert.equal(
      dlRcOnboardingComplete([
        { docType: "dl", fileUrl: "electronic_verified", verified: true },
        { docType: "rc", fileUrl: "electronic_verified", verified: true },
      ]),
      true,
    );
    assert.equal(
      adminCompletedVehicleOnboarding([
        { docType: "dl", verified: true, verificationMethod: "CASHFREE_AUTO" },
        { docType: "rc", verified: true, verificationMethod: "CASHFREE_AUTO" },
      ]),
      true,
    );
  });

  it("completes selfie only when the file is real or verified", () => {
    assert.equal(
      panSelfieOnboardingComplete([{ docType: "selfie", fileUrl: "pending", verified: false }]),
      false,
    );
    assert.equal(
      panSelfieOnboardingComplete([{ docType: "selfie", fileUrl: "https://cdn/selfie.jpg" }]),
      true,
    );
  });

  it("treats dashboard bank_proof EV as bank complete", () => {
    assert.equal(
      bankAccountOnboardingCompleteFromDocs([
        { docType: "bank_proof", verified: true, fileUrl: "electronic_verified" },
      ]),
      true,
    );
  });
});
