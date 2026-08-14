import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPersonalizedShareMessage,
  buildReferralRewardSummary,
} from "./referral.reward-summary.js";
import type { ReferralRewardRule, ReferralSettings } from "./referral.config.service.js";

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
    min_order_amount: 249,
    monthly_reward_cap: 500,
    currency: "INR",
    eligible_services: ["food"],
    config_version: 1,
    updated_at: new Date().toISOString(),
    code_prefix_customer: "GM",
    code_prefix_rider: "RIDER",
    code_prefix_merchant: "MX",
    ...over,
  } as ReferralSettings;
}

function rule(over: Partial<ReferralRewardRule>): ReferralRewardRule {
  return {
    id: 1,
    user_type: "merchant",
    rule_code: "MX50",
    name: "INTERNAL_NAME_MUST_NOT_LEAK",
    description: null,
    milestone_orders: 50,
    reward_amount: 450,
    reward_type: "WALLET_CREDIT",
    reward_party: "referrer",
    also_credit_referred: true,
    referred_reward_amount: 100,
    require_kyc: true,
    min_order_amount: 249,
    active: true,
    priority: 10,
    metadata: {},
    event_type: "ORDER_DELIVERED_COUNT",
    ...over,
  } as ReferralRewardRule;
}

describe("referral user-facing copy", () => {
  it("never mentions Super Admin, referrer labels, or internal rule names", () => {
    const summary = buildReferralRewardSummary(settings(), [rule({})], "merchant");
    const blob = JSON.stringify(summary);
    assert.equal(blob.includes("Super Admin"), false);
    assert.equal(blob.includes("configuration"), false);
    assert.equal(blob.includes("Referrer"), false);
    assert.equal(blob.includes("INTERNAL_NAME"), false);
    assert.equal(blob.includes("STORE_APPROVED"), false);
    assert.equal(summary.youEarnAmount, 450);
    assert.equal(summary.theyEarnAmount, 100);
    assert.equal(summary.requirementOrders, 50);
    assert.match(summary.conditionLine, /₹100/);
    assert.match(summary.conditionLine, /50 delivered orders/);
    assert.equal(summary.shareLines.includes("You earn ₹450"), true);
    assert.equal(summary.shareLines.includes("They earn ₹100"), true);
  });

  it("builds a natural share message from live amounts", () => {
    const summary = buildReferralRewardSummary(settings(), [rule({})], "merchant");
    const message = buildPersonalizedShareMessage({
      referrerName: "Ramesh",
      referralCode: "MXABC123",
      shareUrl: "https://partner.gatimitra.com/merchant-ref/MXABC123",
      summary,
      audience: "merchant",
    });
    assert.match(message, /₹100/);
    assert.equal(message.includes("₹450"), false);
    assert.equal(message.includes("Super Admin"), false);
    assert.equal(message.includes("Referrer"), false);
    assert.equal(message.includes("Gets:"), false);
    assert.match(message, /Hey!/);
    assert.match(message, /MXABC123/);
  });

  it("prefers the delivered-order campaign over a store-approved seed rule", () => {
    const summary = buildReferralRewardSummary(
      settings(),
      [
        rule({
          id: 2,
          rule_code: "MERCHANT_STORE_APPROVED",
          milestone_orders: 0,
          reward_amount: 100,
          referred_reward_amount: 100,
          priority: 10,
          event_type: "STORE_APPROVED",
        }),
        rule({ id: 1, priority: 50 }),
      ],
      "merchant",
    );
    assert.equal(summary.youEarnAmount, 450);
    assert.equal(summary.theyEarnAmount, 100);
    assert.equal(summary.requirementOrders, 50);
    assert.match(summary.conditionLine, /50 delivered orders/);
    assert.equal(summary.conditionLine.includes("store approved"), false);
  });

  it("hides amounts when rewards are paused", () => {
    const summary = buildReferralRewardSummary(
      settings({ merchant_reward_enabled: false, reward_enabled: true }),
      [rule({})],
      "merchant",
    );
    assert.equal(summary.rewardsPaused, true);
    assert.equal(summary.youEarnAmount, null);
    assert.equal(summary.theyEarnAmount, null);
    assert.equal(summary.conditionLine, "Referral rewards are currently unavailable.");
  });
});
