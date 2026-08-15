/**
 * Referral engine unit tests — two-sided state, budget, expiry, auth, eligibility.
 * These tests do not require a database.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  deriveRelationshipRewardState,
  jobStatusToPartyState,
  relationshipIsFullyCredited,
  partiesFromJobs,
} from "./referral.relationship-state.js";
import { campaignBudgetWouldExceed, campaignBudgetRemaining } from "./referral.budget.js";
import {
  expiresAtFromValidityDays,
  isReferralExpired,
  isBlockedCustomerStatus,
  isBlockedRiderStatus,
  resolveMerchantWalletStoreId,
} from "./referral.eligibility.js";
import { isReferralSuperAdminRole } from "./referral.admin-auth.js";
import { playStorePackageFor, type ReferralSettings } from "./referral.config.service.js";

describe("two-sided reward state", () => {
  it("does not mark both credited when only referrer succeeded", () => {
    const state = deriveRelationshipRewardState({
      alsoCreditReferred: true,
      referrer: "credited",
      referred: "pending",
    });
    assert.equal(state, "referrer_credited_referred_pending");
    assert.equal(relationshipIsFullyCredited(state), false);
  });

  it("does not mark both credited when only referred succeeded", () => {
    const state = deriveRelationshipRewardState({
      alsoCreditReferred: true,
      referrer: "pending",
      referred: "credited",
    });
    assert.equal(state, "referred_credited_referrer_pending");
    assert.equal(relationshipIsFullyCredited(state), false);
  });

  it("marks both credited only when both parties credited", () => {
    const state = deriveRelationshipRewardState({
      alsoCreditReferred: true,
      referrer: "credited",
      referred: "credited",
    });
    assert.equal(state, "both_credited");
    assert.equal(relationshipIsFullyCredited(state), true);
  });

  it("keeps referrer-only rules complete after referrer credit", () => {
    const state = deriveRelationshipRewardState({
      alsoCreditReferred: false,
      referrer: "credited",
      referred: "pending",
    });
    assert.equal(state, "both_credited");
    assert.equal(relationshipIsFullyCredited(state), true);
  });

  it("maps one succeeded + one dead without claiming full completion", () => {
    const state = deriveRelationshipRewardState({
      alsoCreditReferred: true,
      referrer: "credited",
      referred: "failed",
    });
    assert.equal(state, "referrer_credited_referred_pending");
    assert.equal(relationshipIsFullyCredited(state), false);
  });

  it("treats duplicate job rows independently per party", () => {
    const parties = partiesFromJobs(
      [
        { reward_party: "referrer", status: "succeeded" },
        { reward_party: "referred", status: "queued" },
      ],
      true,
    );
    assert.equal(parties.referrer, "credited");
    assert.equal(parties.referred, "pending");
  });

  it("maps retrying jobs as pending so they can be retried", () => {
    assert.equal(jobStatusToPartyState("retrying"), "pending");
    assert.equal(jobStatusToPartyState("failed"), "pending");
    assert.equal(jobStatusToPartyState("dead"), "failed");
    assert.equal(jobStatusToPartyState("succeeded"), "credited");
  });
});

describe("campaign budget", () => {
  it("blocks a payout that would exceed the combined cap", () => {
    assert.equal(
      campaignBudgetWouldExceed({ budget: 5000, consumed: 4900, nextAmount: 200 }),
      true,
    );
  });

  it("allows a payout that fits remaining budget", () => {
    assert.equal(
      campaignBudgetWouldExceed({ budget: 5000, consumed: 4900, nextAmount: 100 }),
      false,
    );
  });

  it("does not enforce when budget is null (unlimited)", () => {
    assert.equal(
      campaignBudgetWouldExceed({ budget: null, consumed: 1_000_000, nextAmount: 200 }),
      false,
    );
  });

  it("computes remaining and exhausted", () => {
    assert.equal(campaignBudgetRemaining({ budget: 5000, consumed: 4900 }), 100);
    assert.equal(campaignBudgetRemaining({ budget: 5000, consumed: 5000 }), 0);
    assert.equal(campaignBudgetRemaining({ budget: null, consumed: 10 }), null);
  });
});

describe("referral expiry", () => {
  it("stamps expires_at from validity days when expiry is enabled", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const expires = expiresAtFromValidityDays(30, true, now);
    assert.ok(expires);
    assert.equal(expires!.toISOString(), "2026-01-31T00:00:00.000Z");
  });

  it("does not stamp expiry when disabled", () => {
    assert.equal(expiresAtFromValidityDays(30, false), null);
  });

  it("treats the expiry boundary as expired once the timestamp is past", () => {
    const expiresAt = new Date("2026-01-31T00:00:00.000Z");
    assert.equal(isReferralExpired(expiresAt, new Date("2026-01-31T00:00:00.001Z")), true);
    assert.equal(isReferralExpired(expiresAt, new Date("2026-01-30T23:59:59.000Z")), false);
    assert.equal(isReferralExpired(null, new Date()), false);
  });
});

describe("admin authorization", () => {
  it("allows super_admin and system only", () => {
    assert.equal(isReferralSuperAdminRole("super_admin"), true);
    assert.equal(isReferralSuperAdminRole("system"), true);
    assert.equal(isReferralSuperAdminRole("admin"), false);
    assert.equal(isReferralSuperAdminRole("customer"), false);
    assert.equal(isReferralSuperAdminRole("rider"), false);
    assert.equal(isReferralSuperAdminRole("merchant"), false);
    assert.equal(isReferralSuperAdminRole(undefined), false);
  });
});

describe("blocked user eligibility", () => {
  it("blocks suspended/blocked customers and blocked/banned riders", () => {
    assert.equal(isBlockedCustomerStatus("BLOCKED"), true);
    assert.equal(isBlockedCustomerStatus("SUSPENDED"), true);
    assert.equal(isBlockedCustomerStatus("ACTIVE"), false);
    assert.equal(isBlockedRiderStatus("BANNED"), true);
    assert.equal(isBlockedRiderStatus("ACTIVE"), false);
  });
});

describe("merchant wallet store resolution", () => {
  it("credits the triggering store for ALL_CHILD_STORES", () => {
    assert.equal(
      resolveMerchantWalletStoreId({
        scope: "ALL_CHILD_STORES",
        triggeringStoreId: 42,
        selectedStoreIds: [],
        storeOrderCounts: {},
      }),
      42,
    );
  });

  it("credits only a selected store when scope is SELECTED_STORES", () => {
    assert.equal(
      resolveMerchantWalletStoreId({
        scope: "SELECTED_STORES",
        triggeringStoreId: 7,
        selectedStoreIds: [9, 7],
        storeOrderCounts: {},
      }),
      7,
    );
    assert.equal(
      resolveMerchantWalletStoreId({
        scope: "SELECTED_STORES",
        triggeringStoreId: 3,
        selectedStoreIds: [9, 7],
        storeOrderCounts: {},
      }),
      null,
    );
  });

  it("picks the highest-count store for SINGLE_STORE when trigger is missing", () => {
    assert.equal(
      resolveMerchantWalletStoreId({
        scope: "SINGLE_STORE",
        triggeringStoreId: null,
        selectedStoreIds: [],
        storeOrderCounts: { "11": 2, "22": 8, "33": 5 },
      }),
      22,
    );
  });
});

describe("deep-link packages", () => {
  it("uses configured packages and does not fall back to a different app", () => {
    const settings = {
      deep_link: {
        customer_path_prefix: "/ref",
        customer_invite_prefix: "/invite",
        rider_path_prefix: "/rider-ref",
        merchant_path_prefix: "/merchant-ref",
        play_store_customer_package: "com.gatimitra.customer",
        play_store_rider_package: "com.gatimitra.rider",
        play_store_merchant_package: "com.gatimitra.partner",
        referrer_prefix: "ref_",
      },
    } as ReferralSettings;
    assert.equal(playStorePackageFor(settings, "customer"), "com.gatimitra.customer");
    assert.equal(playStorePackageFor(settings, "rider"), "com.gatimitra.rider");
    assert.equal(playStorePackageFor(settings, "merchant"), "com.gatimitra.partner");
  });
});
