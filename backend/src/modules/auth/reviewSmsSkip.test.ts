/**
 * Backend review bypass must suppress real SMS for armed review phones.
 * Run: node --import tsx --test src/modules/auth/reviewSmsSkip.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createReviewBypasses,
  resolveReviewBypass,
  __test,
} from "./reviewMode.js";

function envBase(over: Record<string, unknown> = {}) {
  return {
    NODE_ENV: "test",
    GOOGLE_REVIEW_MODE: true,
    GOOGLE_REVIEW_PHONE: "+919999999999",
    GOOGLE_REVIEW_OTP: "123456",
    REVIEW_LOGIN_BYPASS_ENABLED: true,
    REVIEW_LOGIN_PHONE: "7367878981",
    REVIEW_LOGIN_FIXED_OTP: "111111",
    RIDER_REVIEW_LOGIN_BYPASS_ENABLED: true,
    RIDER_REVIEW_LOGIN_PHONE: "9113194305",
    RIDER_REVIEW_LOGIN_FIXED_OTP: "222222",
    ...over,
  } as never;
}

test("backend resolveReviewBypass skips SMS identity for Google review phone formats", () => {
  const services = createReviewBypasses(envBase());
  for (const phone of ["+919999999999", "919999999999", "9999999999"]) {
    assert.ok(resolveReviewBypass(services, phone, null), `expected bypass for ${phone}`);
    assert.ok(resolveReviewBypass(services, phone, "customer"));
  }
  assert.equal(resolveReviewBypass(services, "9876543210", null), null);
});

test("backend review bypass off → phone is normal (SMS allowed at policy layer)", () => {
  const services = createReviewBypasses(
    envBase({ GOOGLE_REVIEW_MODE: false, REVIEW_LOGIN_BYPASS_ENABLED: false, RIDER_REVIEW_LOGIN_BYPASS_ENABLED: false }),
  );
  assert.equal(resolveReviewBypass(services, "9999999999", null), null);
});

test("SMS_BLOCKED_PHONES normalization uses canonical digits", () => {
  assert.equal(__test.canonicalSubscriberDigits("+91 65049 92804"), "6504992804");
  assert.equal(__test.canonicalSubscriberDigits("916504992804"), "6504992804");
});
