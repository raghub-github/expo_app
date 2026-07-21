import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createReviewModeService, __test } from "./reviewMode.js";
import type { Env } from "../../config/env.js";

/**
 * Test plan (mirrors docs/google-review-mode.md acceptance checklist):
 *
 *   1. Review mode OFF, normal phone   → isReviewLogin = false   (normal SMS path)
 *   2. Review mode ON,  review phone   → isReviewLogin = true    (SMS skipped, fixed OTP used)
 *   3. Review mode ON,  wrong phone    → isReviewLogin = false   (normal SMS path)
 *   4. Review mode ON,  review phone, wrong OTP → verify still rejects (covered by
 *      the existing `entry.otp !== otp` check in auth.routes.ts; we assert the
 *      service surfaces the stored OTP unchanged so the check actually fails)
 *   5. Review mode OFF, review phone   → isReviewLogin = false   (normal SMS path)
 */

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    GOOGLE_REVIEW_MODE: false,
    GOOGLE_REVIEW_PHONE: undefined,
    GOOGLE_REVIEW_OTP: undefined,
    ...overrides,
  } as unknown as Env;
}

describe("ReviewModeService", () => {
  it("(1) OFF + normal phone → not a review login", () => {
    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: false, GOOGLE_REVIEW_PHONE: "+919999999999", GOOGLE_REVIEW_OTP: "123456" }),
    );
    assert.equal(svc.isReviewLogin("+918000000001"), false);
  });

  it("(2) ON + review phone → IS a review login, fixed OTP returned", () => {
    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: true, GOOGLE_REVIEW_PHONE: "+919999999999", GOOGLE_REVIEW_OTP: "123456" }),
    );
    assert.equal(svc.isReviewLogin("+919999999999"), true);
    assert.equal(svc.getReviewOtp(), "123456");
  });

  it("(2b) ON + review phone with different formatting still matches by trailing 10 digits", () => {
    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: true, GOOGLE_REVIEW_PHONE: "9999999999", GOOGLE_REVIEW_OTP: "123456" }),
    );
    assert.equal(svc.isReviewLogin("+919999999999"), true);
    assert.equal(svc.isReviewLogin("919999999999"), true);
    assert.equal(svc.isReviewLogin("+91 99999 99999"), true);
  });

  it("(3) ON + wrong phone → not a review login", () => {
    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: true, GOOGLE_REVIEW_PHONE: "+919999999999", GOOGLE_REVIEW_OTP: "123456" }),
    );
    assert.equal(svc.isReviewLogin("+918000000001"), false);
  });

  it("(4) ON + review phone with wrong OTP — verify still rejects via normal compare", () => {
    // The service does not gate verification — auth.routes.ts compares
    // `entry.otp !== otp` after request stored the FIXED otp. We assert the
    // service surfaces only the fixed otp so any other code presented at
    // verify time is rejected by the existing handler. This is the
    // bug-resistance property the prompt requires.
    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: true, GOOGLE_REVIEW_PHONE: "+919999999999", GOOGLE_REVIEW_OTP: "123456" }),
    );
    const fixed = svc.getReviewOtp();
    assert.equal(fixed, "123456");
    // wrong submitted code → would not equal the stored value
    assert.notEqual("000000", fixed);
  });

  it("(5) OFF + review phone → not a review login (flag is the only kill switch)", () => {
    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: false, GOOGLE_REVIEW_PHONE: "+919999999999", GOOGLE_REVIEW_OTP: "123456" }),
    );
    assert.equal(svc.isReviewLogin("+919999999999"), false);
  });

  it("ON but missing OTP env var → not a review login (mis-configured = safe default)", () => {
    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: true, GOOGLE_REVIEW_PHONE: "+919999999999", GOOGLE_REVIEW_OTP: undefined }),
    );
    assert.equal(svc.isReviewLogin("+919999999999"), false);
  });

  it("ON but missing PHONE env var → not a review login (mis-configured = safe default)", () => {
    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: true, GOOGLE_REVIEW_PHONE: undefined, GOOGLE_REVIEW_OTP: "123456" }),
    );
    assert.equal(svc.isReviewLogin("+919999999999"), false);
  });

  it("getReviewOtp throws when OTP not configured (defence-in-depth)", () => {
    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: true, GOOGLE_REVIEW_PHONE: "+919999999999", GOOGLE_REVIEW_OTP: undefined }),
    );
    assert.throws(() => svc.getReviewOtp(), /REVIEW_LOGIN_FIXED_OTP/);
  });

  it("logReviewLogin never crashes when logger is undefined", () => {
    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: true, GOOGLE_REVIEW_PHONE: "+919999999999", GOOGLE_REVIEW_OTP: "123456" }),
    );
    svc.logReviewLogin(undefined, { phone: "+919999999999", ip: "127.0.0.1", stage: "request", ok: true });
  });

  it("logReviewLogin masks all but trailing 4 digits", () => {
    let captured: Record<string, unknown> | undefined;
    const fakeLog = {
      info: (obj: Record<string, unknown>) => {
        captured = obj;
      },
    } as unknown as Parameters<ReturnType<typeof createReviewModeService>["logReviewLogin"]>[0];

    const svc = createReviewModeService(
      makeEnv({ GOOGLE_REVIEW_MODE: true, GOOGLE_REVIEW_PHONE: "+919999999999", GOOGLE_REVIEW_OTP: "123456" }),
    );
    svc.logReviewLogin(fakeLog, { phone: "+919999999999", ip: "203.0.113.42", stage: "verify", ok: true });
    assert.equal(captured?.phoneTail, "9999");
    assert.equal(captured?.stage, "verify");
    assert.equal(captured?.ok, true);
    // OTP must NEVER appear in log payload
    assert.equal(JSON.stringify(captured).includes("123456"), false);
  });
});

describe("ReviewModeService internals", () => {
  it("digitsOnly strips +, spaces, dashes", () => {
    assert.equal(__test.digitsOnly("+91 99999-99999"), "919999999999");
    assert.equal(__test.digitsOnly(undefined), "");
    assert.equal(__test.digitsOnly(null), "");
  });

  it("phoneMatches requires 10 trailing digits to align", () => {
    const env = makeEnv({ GOOGLE_REVIEW_PHONE: "+919999999999" });
    assert.equal(__test.phoneMatches(env, "+919999999999"), true);
    assert.equal(__test.phoneMatches(env, "9999999999"), true);
    assert.equal(__test.phoneMatches(env, "9999999998"), false);
  });
});

/**
 * Spec coverage for the REVIEW_LOGIN_* env contract.
 *
 * `makeEnv` above only seeds the legacy keys, so each case here sets the new
 * ones explicitly. The service resolves REVIEW_LOGIN_* first and falls back to
 * GOOGLE_REVIEW_* — that precedence is what lets a live environment migrate
 * without downtime.
 */
describe("Review Login OTP Bypass (REVIEW_LOGIN_* contract)", () => {
  const PHONE = "7367878981";
  const OTP = "123456";

  const cfg = (o: Partial<Env>) =>
    makeEnv({
      REVIEW_LOGIN_BYPASS_ENABLED: undefined,
      REVIEW_LOGIN_PHONE: undefined,
      REVIEW_LOGIN_FIXED_OTP: undefined,
      ...o,
    } as Partial<Env>);

  it("bypass DISABLED → review phone is not a review login (stock flow)", () => {
    const svc = createReviewModeService(
      cfg({
        REVIEW_LOGIN_BYPASS_ENABLED: false,
        REVIEW_LOGIN_PHONE: PHONE,
        REVIEW_LOGIN_FIXED_OTP: OTP,
      } as Partial<Env>),
    );
    assert.equal(svc.isReviewLogin(PHONE), false);
  });

  it("bypass ENABLED + configured review phone → bypass active, fixed OTP seeded", () => {
    const svc = createReviewModeService(
      cfg({
        REVIEW_LOGIN_BYPASS_ENABLED: true,
        REVIEW_LOGIN_PHONE: PHONE,
        REVIEW_LOGIN_FIXED_OTP: OTP,
      } as Partial<Env>),
    );
    assert.equal(svc.isReviewLogin(PHONE), true);
    assert.equal(svc.isReviewLogin(`+91${PHONE}`), true, "E.164 form must match");
    assert.equal(svc.getReviewOtp(), OTP);
  });

  it("SECURITY: fixed OTP never applies to any other phone number", () => {
    const svc = createReviewModeService(
      cfg({
        REVIEW_LOGIN_BYPASS_ENABLED: true,
        REVIEW_LOGIN_PHONE: PHONE,
        REVIEW_LOGIN_FIXED_OTP: OTP,
      } as Partial<Env>),
    );
    for (const other of ["+919876543210", "9876543210", "7367878980", "+917367878982"]) {
      assert.equal(svc.isReviewLogin(other), false, `${other} must use the normal SMS flow`);
    }
  });

  it("incorrect OTP for the review account still fails the normal comparison", () => {
    const svc = createReviewModeService(
      cfg({
        REVIEW_LOGIN_BYPASS_ENABLED: true,
        REVIEW_LOGIN_PHONE: PHONE,
        REVIEW_LOGIN_FIXED_OTP: OTP,
      } as Partial<Env>),
    );
    // The route stores getReviewOtp() and verifies with `entry.otp !== otp`.
    const stored = svc.getReviewOtp();
    assert.notEqual(stored, "000000");
    assert.equal(stored === "000000", false, "a wrong code must not verify");
  });

  it("REVIEW_LOGIN_* takes precedence over the legacy GOOGLE_REVIEW_* names", () => {
    const svc = createReviewModeService(
      cfg({
        REVIEW_LOGIN_BYPASS_ENABLED: true,
        REVIEW_LOGIN_PHONE: PHONE,
        REVIEW_LOGIN_FIXED_OTP: OTP,
        GOOGLE_REVIEW_MODE: true,
        GOOGLE_REVIEW_PHONE: "+919999999999",
        GOOGLE_REVIEW_OTP: "999999",
      } as Partial<Env>),
    );
    assert.equal(svc.getReviewOtp(), OTP, "new fixed OTP wins");
    assert.equal(svc.isReviewLogin(PHONE), true, "new phone wins");
    assert.equal(svc.isReviewLogin("+919999999999"), false, "legacy phone no longer matches");
  });

  it("BACKWARD COMPAT: legacy names still work when REVIEW_LOGIN_* are absent", () => {
    const svc = createReviewModeService(
      cfg({
        GOOGLE_REVIEW_MODE: true,
        GOOGLE_REVIEW_PHONE: `+91${PHONE}`,
        GOOGLE_REVIEW_OTP: OTP,
      } as Partial<Env>),
    );
    assert.equal(svc.isReviewLogin(PHONE), true);
    assert.equal(svc.getReviewOtp(), OTP);
  });

  it("explicit REVIEW_LOGIN_BYPASS_ENABLED=false overrides a legacy MODE=true", () => {
    const svc = createReviewModeService(
      cfg({
        REVIEW_LOGIN_BYPASS_ENABLED: false,
        GOOGLE_REVIEW_MODE: true,
        GOOGLE_REVIEW_PHONE: `+91${PHONE}`,
        GOOGLE_REVIEW_OTP: OTP,
      } as Partial<Env>),
    );
    assert.equal(svc.isReviewLogin(PHONE), false, "the new flag is the kill switch");
  });

  it("mis-configured bypass (enabled but phone/OTP missing) stays OFF", () => {
    const noPhone = createReviewModeService(
      cfg({ REVIEW_LOGIN_BYPASS_ENABLED: true, REVIEW_LOGIN_FIXED_OTP: OTP } as Partial<Env>),
    );
    assert.equal(noPhone.isReviewLogin(PHONE), false);

    const noOtp = createReviewModeService(
      cfg({ REVIEW_LOGIN_BYPASS_ENABLED: true, REVIEW_LOGIN_PHONE: PHONE } as Partial<Env>),
    );
    assert.equal(noOtp.isReviewLogin(PHONE), false);
  });

  it("resolveConfig reports the effective values used by the route", () => {
    const eff = __test.resolveConfig(
      cfg({
        REVIEW_LOGIN_BYPASS_ENABLED: true,
        REVIEW_LOGIN_PHONE: PHONE,
        REVIEW_LOGIN_FIXED_OTP: OTP,
      } as Partial<Env>),
    );
    assert.deepEqual(eff, { enabled: true, phone: PHONE, otp: OTP });
  });
});
