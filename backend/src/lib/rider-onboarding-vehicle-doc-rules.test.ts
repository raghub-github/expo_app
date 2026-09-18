import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterSkippableOnboardingDocs,
  validateRequiredVehicleDocs,
} from "./rider-onboarding-vehicle-doc-rules.js";

describe("rider-onboarding-vehicle-doc-rules", () => {
  const evCarReq = {
    required_docs: ["rc", "dl", "rental_proof", "ev_proof"],
    optional_docs: [] as string[],
  };

  const evBikeReq = {
    required_docs: ["rental_proof", "ev_proof"],
    optional_docs: ["rc", "dl"],
  };

  it("drops mandatory doc codes from skip list", () => {
    assert.deepEqual(
      filterSkippableOnboardingDocs(evCarReq, ["rc", "dl", "rental_proof"]),
      [],
    );
  });

  it("keeps soft onboarding skips for required docs when allowed", () => {
    assert.deepEqual(
      filterSkippableOnboardingDocs(evCarReq, ["rc", "dl"], {
        allowOnboardingSoftSkips: true,
      }).slice().sort(),
      ["dl", "rc"],
    );
  });

  it("keeps only optional vehicle skips and bank skips", () => {
    const kept = filterSkippableOnboardingDocs(evBikeReq, [
      "rc",
      "bank_account",
      "dl",
    ]);
    assert.deepEqual(kept.slice().sort(), ["bank_account", "dl", "rc"]);
  });

  it("preserves bank skips when vehicle requirements are unknown", () => {
    assert.deepEqual(
      filterSkippableOnboardingDocs(null, ["rc", "bank_proof"]),
      ["bank_proof"],
    );
  });

  it("rejects submit when required RC is missing but was skipped", () => {
    const result = validateRequiredVehicleDocs(
      evCarReq,
      [{ docType: "dl", fileUrl: "https://cdn/dl.jpg" }],
      ["rc"],
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      // Soft skip may keep "rc"; other required docs still missing.
      assert.ok(result.missing.includes("rental_proof") || result.missing.includes("ev_proof"));
      assert.ok(!result.missing.includes("rc"));
    }
  });

  it("accepts soft-skipped required RC when other required docs are present", () => {
    const result = validateRequiredVehicleDocs(
      evCarReq,
      [
        { docType: "dl", fileUrl: "https://cdn/dl.jpg" },
        { docType: "rental_proof", fileUrl: "https://cdn/r.pdf" },
        { docType: "ev_proof", fileUrl: "https://cdn/e.pdf" },
      ],
      ["rc"],
    );
    assert.equal(result.ok, true);
  });

  it("accepts when all required docs are present", () => {
    const result = validateRequiredVehicleDocs(
      evCarReq,
      [
        { docType: "dl", fileUrl: "https://cdn/dl.jpg" },
        { docType: "rc", fileUrl: "https://cdn/rc.jpg" },
        { docType: "rental_proof", fileUrl: "https://cdn/r.pdf" },
        { docType: "ev_proof", fileUrl: "https://cdn/e.pdf" },
      ],
      [],
    );
    assert.equal(result.ok, true);
  });
});
