import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyMerchantReferralError,
  merchantReferralPublicMessage,
  pickMerchantReferralCode,
} from "./referral.onboarding.js";
import {
  DEFAULT_MERCHANT_REFERRAL_PUBLIC_BASE,
  resolveReferralPublicBaseFor,
} from "./referral.tracking.service.js";

describe("merchant referral onboarding helpers", () => {
  it("maps backend errors to user-facing copy without leaking internals", () => {
    assert.equal(
      merchantReferralPublicMessage("invalid_code"),
      "Invalid referral code. Please check the code and try again.",
    );
    assert.equal(
      merchantReferralPublicMessage("expired"),
      "This referral code is no longer valid.",
    );
    assert.equal(
      merchantReferralPublicMessage("self_referral"),
      "This referral cannot be applied to this account.",
    );
    assert.equal(
      merchantReferralPublicMessage("user_ineligible"),
      "This referral cannot be applied to this account.",
    );
    assert.doesNotMatch(merchantReferralPublicMessage("referrer_limit_reached"), /₹|rule|admin/i);
    assert.equal(
      merchantReferralPublicMessage("REFERRAL_SERVICE_DISABLED"),
      "This referral code is no longer available.",
    );
    assert.equal(
      merchantReferralPublicMessage("referral_disabled"),
      "This referral code is no longer available.",
    );
  });

  it("classifies errors for Partner Site / AM Apply UI", () => {
    assert.equal(classifyMerchantReferralError("invalid_code"), "invalid_code");
    assert.equal(classifyMerchantReferralError("expired"), "expired");
    assert.equal(classifyMerchantReferralError("self_referral"), "self_referral");
    assert.equal(classifyMerchantReferralError("same_phone"), "not_eligible");
    assert.equal(classifyMerchantReferralError("REFERRAL_SERVICE_DISABLED"), "REFERRAL_SERVICE_DISABLED");
    assert.equal(classifyMerchantReferralError("referral_disabled"), "REFERRAL_SERVICE_DISABLED");
  });

  it("picks explicit code over deep-link over stored pending", () => {
    assert.equal(
      pickMerchantReferralCode({
        explicit: "MXEXPLICIT",
        deepLink: "MXDEEPLINK",
        stored: "MXSTORED",
      }),
      "MXEXPLICIT",
    );
    assert.equal(
      pickMerchantReferralCode({
        explicit: "  ",
        deepLink: "mxdeeplink",
        stored: "MXSTORED",
      }),
      "MXDEEPLINK",
    );
    assert.equal(
      pickMerchantReferralCode({
        explicit: null,
        deepLink: "",
        stored: "mxstored",
      }),
      "MXSTORED",
    );
    assert.equal(pickMerchantReferralCode({}), null);
  });

  it("points merchant share links at Partner Site", () => {
    const prevMerchant = process.env.MERCHANT_REFERRAL_LINK_BASE_URL;
    const prevPartner = process.env.PARTNER_SITE_URL;
    const prevBase = process.env.REFERRAL_LINK_BASE_URL;
    delete process.env.MERCHANT_REFERRAL_LINK_BASE_URL;
    delete process.env.PARTNER_SITE_URL;
    process.env.REFERRAL_LINK_BASE_URL = "https://gatimitra.com";
    try {
      assert.equal(resolveReferralPublicBaseFor("merchant"), DEFAULT_MERCHANT_REFERRAL_PUBLIC_BASE);
      assert.equal(resolveReferralPublicBaseFor("customer"), "https://gatimitra.com");
    } finally {
      if (prevMerchant) process.env.MERCHANT_REFERRAL_LINK_BASE_URL = prevMerchant;
      if (prevPartner) process.env.PARTNER_SITE_URL = prevPartner;
      if (prevBase) process.env.REFERRAL_LINK_BASE_URL = prevBase;
      else delete process.env.REFERRAL_LINK_BASE_URL;
    }
  });
});
