/**
 * Unit tests — referral lifecycle state machine + secure code generation.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canTransition, FUNNEL_STAGES } from "./referral.lifecycle.js";
import { generateSecureReferralCode } from "./referral.codes.js";

describe("referral lifecycle transitions", () => {
  it("allows LINK_CLICKED → PLAY_STORE_OPENED", () => {
    assert.equal(canTransition("LINK_CLICKED", "PLAY_STORE_OPENED"), true);
  });

  it("rejects REWARD_NOTIFIED → LINK_SHARED", () => {
    assert.equal(canTransition("REWARD_NOTIFIED", "LINK_SHARED"), false);
  });

  it("allows same-state no-op", () => {
    assert.equal(canTransition("REFERRAL_APPLIED", "REFERRAL_APPLIED"), true);
  });

  it("funnel stages are ordered", () => {
    assert.ok(FUNNEL_STAGES.indexOf("LINK_CLICKED") < FUNNEL_STAGES.indexOf("APP_INSTALLED"));
    assert.ok(FUNNEL_STAGES.indexOf("REFERRAL_APPLIED") < FUNNEL_STAGES.indexOf("REWARD_GRANTED"));
  });
});

describe("secure referral codes", () => {
  it("generates prefixed uppercase codes without ambiguous chars", () => {
    const code = generateSecureReferralCode("GM", 8);
    assert.match(code, /^GM[A-Z2-9]{8}$/);
    assert.equal(code.includes("0"), false);
    assert.equal(code.includes("O"), false);
    assert.equal(code.includes("1"), false);
    assert.equal(code.includes("I"), false);
  });

  it("is collision-resistant across samples", () => {
    const set = new Set<string>();
    for (let i = 0; i < 200; i++) set.add(generateSecureReferralCode("GM", 8));
    assert.equal(set.size, 200);
  });
});
