/**
 * Run: node --import tsx --test partnersite/src/lib/auth/review-sms-bypass.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalSubscriberDigits,
  getArmedReviewOtp,
  isArmedReviewPhone,
  shouldSuppressMsg91Sms,
} from "./review-sms-bypass";

describe("canonicalSubscriberDigits formatting", () => {
  it("normalizes +91 / 91 / spaces / bare 10-digit", () => {
    assert.equal(canonicalSubscriberDigits("+91 99999 99999"), "9999999999");
    assert.equal(canonicalSubscriberDigits("919999999999"), "9999999999");
    assert.equal(canonicalSubscriberDigits("9999999999"), "9999999999");
    assert.equal(canonicalSubscriberDigits("09999999999"), "9999999999");
  });
});

describe("armed Google review phone — zero MSG91", () => {
  const env = {
    GOOGLE_REVIEW_MODE: "true",
    GOOGLE_REVIEW_PHONE: "+919999999999",
    GOOGLE_REVIEW_OTP: "123456",
  };

  it("suppresses MSG91 for review phone in every format", () => {
    for (const phone of ["+919999999999", "919999999999", "9999999999", "+91 9999999999"]) {
      const r = shouldSuppressMsg91Sms(phone, env);
      assert.equal(r.suppress, true);
      assert.equal(r.suppress && r.reason, "review_bypass");
      assert.equal(isArmedReviewPhone(phone, env), true);
    }
  });

  it("does not suppress a normal user phone", () => {
    const r = shouldSuppressMsg91Sms("9876543210", env);
    assert.equal(r.suppress, false);
  });

  // A realistic number here: 99999 99999 itself is never SMSed (undeliverable dummy),
  // so it cannot show the review switch failing closed.
  it("half-configured review mode does not suppress (fail closed for bypass)", () => {
    const r = shouldSuppressMsg91Sms("9876501234", {
      GOOGLE_REVIEW_MODE: "true",
      GOOGLE_REVIEW_PHONE: "+919876501234",
      // missing OTP
    });
    assert.equal(r.suppress, false);
  });

  it("review mode disabled → normal OTP behavior", () => {
    const r = shouldSuppressMsg91Sms("9876501234", {
      GOOGLE_REVIEW_MODE: "false",
      GOOGLE_REVIEW_PHONE: "+919876501234",
      GOOGLE_REVIEW_OTP: "123456",
    });
    assert.equal(r.suppress, false);
  });
});

describe("merchant + rider review identities", () => {
  it("suppresses merchant and rider review phones when armed", () => {
    const env = {
      REVIEW_LOGIN_BYPASS_ENABLED: "true",
      REVIEW_LOGIN_PHONE: "7367878981",
      REVIEW_LOGIN_FIXED_OTP: "123456",
      RIDER_REVIEW_LOGIN_BYPASS_ENABLED: "1",
      RIDER_REVIEW_LOGIN_PHONE: "+91 91131 94305",
      RIDER_REVIEW_LOGIN_FIXED_OTP: "654321",
    };
    assert.equal(shouldSuppressMsg91Sms("7367878981", env).suppress, true);
    assert.equal(shouldSuppressMsg91Sms("9113194305", env).suppress, true);
    assert.equal(shouldSuppressMsg91Sms("9876501234", env).suppress, false);
  });
});

describe("SMS_BLOCKED_PHONES extra safeguard", () => {
  it("suppresses blocked numbers even without review mode", () => {
    const r = shouldSuppressMsg91Sms("+91 6504992804", {
      SMS_BLOCKED_PHONES: "6504992804, 9999999999",
    });
    assert.equal(r.suppress, true);
    assert.equal(r.suppress && r.reason, "sms_blocked");
  });
});

describe("getArmedReviewOtp", () => {
  it("returns configured OTP for armed review phone", () => {
    assert.equal(
      getArmedReviewOtp("9999999999", {
        GOOGLE_REVIEW_MODE: "true",
        GOOGLE_REVIEW_PHONE: "+919999999999",
        GOOGLE_REVIEW_OTP: "123456",
      }),
      "123456",
    );
  });
});

// ---- undeliverable dummy numbers (2026-11-20: MSG91 "Failed" + billed for 99999 99999) ----
import { isUndeliverableDummyPhone, shouldSuppressMsg91Sms as suppressForDummy } from "./review-sms-bypass";

it("send-sms hook never bills MSG91 for 99999 99999 and other dummy numbers", () => {
  for (const p of ["+919999999999", "919999999999", "9999999999", "+910000000000", "1234567890"]) {
    assert.equal(isUndeliverableDummyPhone(p), true, p);
    const d = suppressForDummy(p, {});
    assert.equal(d.suppress, true, p);
    assert.equal(d.suppress && d.reason, "undeliverable");
  }
  for (const p of ["+919113194305", "+916504992804"]) {
    assert.equal(suppressForDummy(p, {}).suppress, false, p);
  }
});
