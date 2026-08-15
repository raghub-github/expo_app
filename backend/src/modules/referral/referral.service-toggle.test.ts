/**
 * Global Customer / Rider / Merchant referral service toggles.
 * These tests do not require a database.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ReferralSettings } from "./referral.config.service.js";
import {
  referralRewardsEnabled,
  referralTrackingEnabled,
} from "./referral.participants.js";
import {
  REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE,
  REFERRAL_SERVICE_DISABLED,
  REFERRAL_SERVICE_DISABLED_API_MESSAGE,
  httpStatusForReferralApplyError,
  isReferralServiceDisabledError,
  referralServiceDisabledPayload,
} from "./referral.errors.js";
import {
  classifyMerchantReferralError,
  merchantReferralPublicMessage,
} from "./referral.onboarding.js";

function settings(over: Partial<ReferralSettings> = {}): ReferralSettings {
  return {
    id: 1,
    enabled: true,
    reward_enabled: true,
    customer_referral_enabled: true,
    rider_referral_enabled: true,
    merchant_referral_enabled: true,
    customer_reward_enabled: true,
    rider_reward_enabled: true,
    merchant_reward_enabled: true,
    auto_apply_enabled: true,
    require_kyc: false,
    first_order_only: true,
    min_order_amount: 0,
    monthly_reward_cap: 0,
    currency: "INR",
    eligible_services: ["food"],
    config_version: 44,
    updated_at: new Date().toISOString(),
    ...over,
  } as ReferralSettings;
}

describe("independent referral service toggles", () => {
  it("disables only the audience whose toggle is OFF", () => {
    const s = settings({
      customer_referral_enabled: false,
      rider_referral_enabled: true,
      merchant_referral_enabled: true,
    });
    assert.equal(referralTrackingEnabled(s, "customer"), false);
    assert.equal(referralTrackingEnabled(s, "rider"), true);
    assert.equal(referralTrackingEnabled(s, "merchant"), true);
  });

  it("treats master enabled=false as all services OFF", () => {
    const s = settings({ enabled: false });
    assert.equal(referralTrackingEnabled(s, "customer"), false);
    assert.equal(referralTrackingEnabled(s, "rider"), false);
    assert.equal(referralTrackingEnabled(s, "merchant"), false);
  });

  it("does not freeze existing reward credits when a service toggle is OFF", () => {
    const s = settings({
      customer_referral_enabled: false,
      rider_referral_enabled: false,
      merchant_referral_enabled: false,
      customer_reward_enabled: true,
      rider_reward_enabled: true,
      merchant_reward_enabled: true,
    });
    assert.equal(referralRewardsEnabled(s, "customer"), true);
    assert.equal(referralRewardsEnabled(s, "rider"), true);
    assert.equal(referralRewardsEnabled(s, "merchant"), true);
  });

  it("still honors the dedicated reward toggles", () => {
    const s = settings({ customer_reward_enabled: false, reward_enabled: true });
    assert.equal(referralRewardsEnabled(s, "customer"), false);
    assert.equal(referralTrackingEnabled(s, "customer"), true);
  });
});

describe("REFERRAL_SERVICE_DISABLED API contract", () => {
  it("uses HTTP 409 and a stable machine code", () => {
    assert.equal(httpStatusForReferralApplyError(REFERRAL_SERVICE_DISABLED), 409);
    assert.equal(httpStatusForReferralApplyError("referral_disabled"), 409);
    assert.equal(httpStatusForReferralApplyError("invalid_code"), 400);
    assert.equal(isReferralServiceDisabledError(REFERRAL_SERVICE_DISABLED), true);
    assert.equal(isReferralServiceDisabledError("referral_disabled"), true);
    assert.equal(isReferralServiceDisabledError("invalid_code"), false);
  });

  it("does not leak Super Admin / config internals in the payload", () => {
    const payload = referralServiceDisabledPayload();
    assert.equal(payload.ok, false);
    assert.equal(payload.valid, false);
    assert.equal(payload.error, REFERRAL_SERVICE_DISABLED);
    assert.equal(payload.code, REFERRAL_SERVICE_DISABLED);
    assert.equal(payload.message, REFERRAL_SERVICE_DISABLED_API_MESSAGE);
    assert.equal(payload.userMessage, REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE);
    const blob = JSON.stringify(payload);
    assert.doesNotMatch(blob, /super admin|config_version|rule id|database/i);
  });

  it("maps the machine code to the same user-facing copy for every surface", () => {
    assert.equal(
      merchantReferralPublicMessage(REFERRAL_SERVICE_DISABLED),
      REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE,
    );
    assert.equal(
      merchantReferralPublicMessage("referral_disabled"),
      REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE,
    );
    assert.equal(classifyMerchantReferralError(REFERRAL_SERVICE_DISABLED), REFERRAL_SERVICE_DISABLED);
    assert.equal(classifyMerchantReferralError("referral_disabled"), REFERRAL_SERVICE_DISABLED);
  });
});
