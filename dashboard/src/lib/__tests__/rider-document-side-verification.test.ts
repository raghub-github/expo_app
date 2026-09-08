import test from "node:test";
import assert from "node:assert/strict";
import {
  areAllRequiredSidesApproved,
  buildSideVerificationPatch,
} from "../rider-document-side-verification";

test("stub with no files is not complete via side approvals alone (needs electronic verify)", () => {
  const metadata = buildSideVerificationPatch(null, "front", {
    verified: true,
    verificationStatus: "approved",
  });
  assert.equal(areAllRequiredSidesApproved(metadata, []), false);
});

test("photo Aadhaar with both sides still requires both approvals", () => {
  const files = [{ side: "front" }, { side: "back" }];
  const frontOnly = buildSideVerificationPatch(null, "front", {
    verified: true,
    verificationStatus: "approved",
  });
  assert.equal(areAllRequiredSidesApproved(frontOnly, files), false);
  const both = buildSideVerificationPatch(frontOnly, "back", {
    verified: true,
    verificationStatus: "approved",
  });
  assert.equal(areAllRequiredSidesApproved(both, files), true);
});
