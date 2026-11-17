/**
 * Run: node --import tsx --test partnersite/src/lib/auth/sms-send-guard.test.ts
 */
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  __resetSmsSendGuardForTests,
  blockedPhones,
  checkAndRecordSmsSend,
  isBlockedPhone,
  phoneKey,
} from "./sms-send-guard";

describe("SMS_BLOCKED_PHONES (explicit opt-in)", () => {
  it("keys every format to the last 10 digits", () => {
    assert.equal(phoneKey("+91 91131 94305"), "9113194305");
    assert.equal(phoneKey("919113194305"), "9113194305");
    assert.equal(phoneKey("12345"), "");
  });

  it("blocks only the listed numbers, in any format", () => {
    const env = { SMS_BLOCKED_PHONES: " 9113194305, +91 73678 78981 ," };
    assert.deepEqual([...blockedPhones(env)].sort(), ["7367878981", "9113194305"]);
    assert.equal(isBlockedPhone("919113194305", env), true);
    assert.equal(isBlockedPhone("+917367878981", env), true);
    assert.equal(isBlockedPhone("9876543210", env), false);
  });

  it("blocks nothing by default — review-number env names alone do not block", () => {
    const env = { REVIEW_LOGIN_PHONE: "7367878981", RIDER_REVIEW_LOGIN_PHONE: "9113194305" };
    assert.equal(isBlockedPhone("9113194305", env), false);
    assert.equal(isBlockedPhone("7367878981", {}), false);
  });
});

describe("per-phone cooldown + daily cap", () => {
  beforeEach(() => __resetSmsSendGuardForTests());
  const env = { OTP_SEND_MIN_INTERVAL_SEC: "45", OTP_SEND_DAILY_CAP: "3" };

  it("allows one send per cooldown window, per number", () => {
    const t = 1_000_000;
    assert.deepEqual(checkAndRecordSmsSend("9876543210", t, env), { allowed: true });
    const blocked = checkAndRecordSmsSend("+919876543210", t + 10_000, env);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.allowed === false && blocked.reason, "cooldown");
    assert.equal(blocked.allowed === false && blocked.retryAfterSec, 35);
    assert.deepEqual(checkAndRecordSmsSend("9876543211", t + 10_000, env), { allowed: true });
    assert.deepEqual(checkAndRecordSmsSend("9876543210", t + 45_000, env), { allowed: true });
  });

  it("caps sends per day, then resets after 24 h", () => {
    let t = 5_000_000;
    for (let i = 0; i < 3; i++, t += 60_000) {
      assert.deepEqual(checkAndRecordSmsSend("9876543210", t, env), { allowed: true });
    }
    const capped = checkAndRecordSmsSend("9876543210", t, env);
    assert.equal(capped.allowed === false && capped.reason, "daily_cap");
    assert.deepEqual(checkAndRecordSmsSend("9876543210", 5_000_000 + 24 * 3_600_000, env), {
      allowed: true,
    });
  });

  it("defaults to 45 s / 15 per day", () => {
    assert.deepEqual(checkAndRecordSmsSend("9876543210", 0, {}), { allowed: true });
    const r = checkAndRecordSmsSend("9876543210", 44_000, {});
    assert.equal(r.allowed === false && r.reason, "cooldown");
  });
});
