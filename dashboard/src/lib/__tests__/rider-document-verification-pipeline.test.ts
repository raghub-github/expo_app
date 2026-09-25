import test from "node:test";
import assert from "node:assert/strict";
import {
  buildManualApproveFields,
  computePendingManualDocuments,
  isAwaitingManualReview,
  isCanonicallyVerified,
} from "../rider-document-verification-pipeline";

test("canonical verified uses verified flag or approved/auto_verified status", () => {
  assert.equal(isCanonicallyVerified({ verified: true, verificationStatus: "pending" }), true);
  assert.equal(isCanonicallyVerified({ verified: false, verificationStatus: "approved" }), true);
  assert.equal(
    isCanonicallyVerified({ verified: false, verificationStatus: "auto_verified" }),
    true,
  );
  assert.equal(isCanonicallyVerified({ verified: false, verificationStatus: "pending" }), false);
  assert.equal(isCanonicallyVerified({ verified: false, verificationStatus: "rejected" }), false);
});

test("manual approve fields store MANUAL_UPLOAD + approved + verifier", () => {
  const fields = buildManualApproveFields(42);
  assert.equal(fields.verified, true);
  assert.equal(fields.verificationStatus, "approved");
  assert.equal(fields.verificationMethod, "MANUAL_UPLOAD");
  assert.equal(fields.verifierUserId, 42);
  assert.equal(fields.verifiedBy, 42);
  assert.equal(fields.requiresManualReview, false);
  assert.equal(fields.rejectedReason, null);
});

test("every manually verified document type is removed from pending", () => {
  const types = [
    "dl_front",
    "dl_back",
    "rc",
    "rental_proof",
    "ev_proof",
    "bank_proof",
    "insurance",
    "vehicle_image",
    "aadhaar_front",
    "pan",
    "selfie",
  ];
  const documents = types.map((docType, i) => ({
    id: i + 1,
    riderId: 1,
    docType,
    verified: true,
    verificationStatus: "approved",
    verificationMethod: "MANUAL_UPLOAD",
    fileUrl: "https://example.com/doc.jpg",
    r2Key: `r2/${docType}`,
  }));
  const pending = computePendingManualDocuments({ documents, vehicles: [] });
  assert.deepEqual(pending, []);
});

test("uploaded unverified docs remain pending", () => {
  const pending = computePendingManualDocuments({
    documents: [
      {
        id: 1,
        riderId: 1,
        docType: "insurance",
        verified: false,
        verificationStatus: "pending",
        verificationMethod: "MANUAL_UPLOAD",
        fileUrl: "https://example.com/ins.jpg",
        r2Key: "r2/ins",
      },
      {
        id: 2,
        riderId: 1,
        docType: "bank_proof",
        verified: false,
        verificationStatus: "pending",
        verificationMethod: "MANUAL_UPLOAD",
        requiresManualReview: true,
        fileUrl: "https://example.com/bank.jpg",
        r2Key: "r2/bank",
      },
    ],
    vehicles: [],
  });
  assert.deepEqual(pending.map((d) => d.docType).sort(), ["bank_proof", "insurance"]);
});

test("verified RC document suppresses synthetic vehicle pending", () => {
  const pending = computePendingManualDocuments({
    documents: [
      {
        id: 10,
        riderId: 1022,
        docType: "rc",
        verified: true,
        verificationStatus: "approved",
        verificationMethod: "MANUAL_UPLOAD",
        docNumber: "HR26DQ5551",
        fileUrl: "https://example.com/rc.jpg",
        r2Key: "r2/rc",
      },
    ],
    vehicles: [
      {
        id: 99,
        registrationNumber: "HR26DQ5551",
        verified: false,
        vehicleActiveStatus: "active",
        updatedAt: new Date(),
      },
    ],
  });
  assert.deepEqual(pending, []);
});

test("unverified vehicle still surfaces when no verified RC document exists", () => {
  const pending = computePendingManualDocuments({
    documents: [],
    vehicles: [
      {
        id: 99,
        registrationNumber: "HR26DQ5551",
        verified: false,
        vehicleActiveStatus: "active",
        updatedAt: new Date(),
      },
    ],
  });
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.docType, "rc");
  assert.match(pending[0]?.label ?? "", /HR26DQ5551/);
});

test("isAwaitingManualReview false after canonical verify for any type", () => {
  for (const docType of ["rc", "dl", "insurance", "vehicle_image", "bank_proof"]) {
    assert.equal(
      isAwaitingManualReview({
        id: 1,
        riderId: 1,
        docType,
        verified: true,
        verificationStatus: "approved",
        verificationMethod: "MANUAL_UPLOAD",
        fileUrl: "https://x/y.jpg",
        r2Key: "k",
      }),
      false,
    );
  }
});
