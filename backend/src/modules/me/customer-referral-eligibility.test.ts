import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customerNeedsReferralCode } from "./customer-referral-eligibility.js";

describe("customerNeedsReferralCode", () => {
  it("true for a completed, real-named customer with no code (the bug case)", () => {
    assert.equal(
      customerNeedsReferralCode({
        referralCode: null,
        profileCompleted: true,
        fullName: "Bhim Pratap Singh",
      }),
      true,
    );
  });

  it("false when a code already exists", () => {
    assert.equal(
      customerNeedsReferralCode({ referralCode: "BHIM1AB", profileCompleted: true, fullName: "Bhim" }),
      false,
    );
    // whitespace-only code is treated as no code
    assert.equal(
      customerNeedsReferralCode({ referralCode: "   ", profileCompleted: true, fullName: "Bhim" }),
      true,
    );
  });

  it("false when the profile is not completed", () => {
    assert.equal(
      customerNeedsReferralCode({ referralCode: null, profileCompleted: false, fullName: "Bhim" }),
      false,
    );
    assert.equal(
      customerNeedsReferralCode({ referralCode: null, profileCompleted: null, fullName: "Bhim" }),
      false,
    );
  });

  it("false when the name is missing or still the 'Pending' placeholder", () => {
    for (const fullName of [null, undefined, "", "   ", "Pending", "  pending  ", "PENDING"]) {
      assert.equal(
        customerNeedsReferralCode({ referralCode: null, profileCompleted: true, fullName }),
        false,
        `expected not-eligible for name=${JSON.stringify(fullName)}`,
      );
    }
  });
});
