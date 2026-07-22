import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createReviewModeService,
  createPartnerReviewLoginService,
  createReviewBypasses,
  matchReviewBypass,
  __test,
} from "./reviewMode.js";
import type { Env } from "../../config/env.js";

/**
 * Two INDEPENDENT store-review bypasses:
 *
 *   Partner (merchant + rider) → REVIEW_LOGIN_BYPASS_ENABLED / REVIEW_LOGIN_PHONE / REVIEW_LOGIN_FIXED_OTP
 *   Customer app               → GOOGLE_REVIEW_MODE / GOOGLE_REVIEW_PHONE / GOOGLE_REVIEW_OTP
 *
 * They share no config and never fall back to each other. The route picks the
 * bypass by phone number (the OTP request body has no appType), so the critical
 * property is that each fixed OTP is seeded ONLY for its own phone. The partner
 * bypass serves BOTH the merchant and rider apps (same phone, same OTP, same
 * backend OTP endpoints); verify's appType selects the pipeline.
 */

const MERCHANT_PHONE = "7367878981";
const MERCHANT_OTP = "123456";
const CUSTOMER_PHONE = "9999999999";
const CUSTOMER_OTP = "654321";

function makeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: "test",
    REVIEW_LOGIN_BYPASS_ENABLED: false,
    REVIEW_LOGIN_PHONE: undefined,
    REVIEW_LOGIN_FIXED_OTP: undefined,
    GOOGLE_REVIEW_MODE: false,
    GOOGLE_REVIEW_PHONE: undefined,
    GOOGLE_REVIEW_OTP: undefined,
    ...overrides,
  } as unknown as Env;
}

/** Merchant bypass fully enabled. */
const merchantOn = (o: Partial<Env> = {}) =>
  makeEnv({
    REVIEW_LOGIN_BYPASS_ENABLED: true,
    REVIEW_LOGIN_PHONE: MERCHANT_PHONE,
    REVIEW_LOGIN_FIXED_OTP: MERCHANT_OTP,
    ...o,
  } as Partial<Env>);

/** Both bypasses enabled, each with its own distinct number. */
const bothOn = () =>
  merchantOn({
    GOOGLE_REVIEW_MODE: true,
    GOOGLE_REVIEW_PHONE: CUSTOMER_PHONE,
    GOOGLE_REVIEW_OTP: CUSTOMER_OTP,
  } as Partial<Env>);

describe("Merchant app review login bypass (REVIEW_LOGIN_*)", () => {
  it("disabled by default → review phone uses the normal SMS flow", () => {
    const svc = createPartnerReviewLoginService(makeEnv());
    assert.equal(svc.isReviewLogin(MERCHANT_PHONE), false);
  });

  it("flag off but phone/OTP configured → still off (flag is the kill switch)", () => {
    const svc = createPartnerReviewLoginService(
      makeEnv({
        REVIEW_LOGIN_BYPASS_ENABLED: false,
        REVIEW_LOGIN_PHONE: MERCHANT_PHONE,
        REVIEW_LOGIN_FIXED_OTP: MERCHANT_OTP,
      } as Partial<Env>),
    );
    assert.equal(svc.isReviewLogin(MERCHANT_PHONE), false);
  });

  it("enabled + configured phone → bypass active, fixed OTP seeded", () => {
    const svc = createPartnerReviewLoginService(merchantOn());
    assert.equal(svc.isReviewLogin(MERCHANT_PHONE), true);
    assert.equal(svc.getReviewOtp(), MERCHANT_OTP);
    assert.equal(svc.app, "partner");
  });

  it("matches the same subscriber in any format (+91 / 91 / bare / spaced)", () => {
    const svc = createPartnerReviewLoginService(merchantOn());
    for (const f of ["+917367878981", "917367878981", "7367878981", "+91 73678 78981"]) {
      assert.equal(svc.isReviewLogin(f), true, `${f} should match`);
    }
  });

  it("SECURITY: the fixed OTP never applies to any other phone number", () => {
    const svc = createPartnerReviewLoginService(merchantOn());
    for (const other of ["+919876543210", "9876543210", "7367878980", "+917367878982", ""]) {
      assert.equal(svc.isReviewLogin(other), false, `${other} must use the normal SMS flow`);
    }
  });

  it("wrong OTP for the review account still fails the normal comparison", () => {
    const svc = createPartnerReviewLoginService(merchantOn());
    // The route stores getReviewOtp() then verifies with `entry.otp !== otp`.
    const stored = svc.getReviewOtp();
    assert.equal(stored === "000000", false, "a wrong code must not verify");
    assert.equal(stored === MERCHANT_OTP, true);
  });

  it("half-configured bypass stays OFF (fail closed)", () => {
    const noPhone = createPartnerReviewLoginService(
      makeEnv({
        REVIEW_LOGIN_BYPASS_ENABLED: true,
        REVIEW_LOGIN_FIXED_OTP: MERCHANT_OTP,
      } as Partial<Env>),
    );
    assert.equal(noPhone.isReviewLogin(MERCHANT_PHONE), false);

    const noOtp = createPartnerReviewLoginService(
      makeEnv({
        REVIEW_LOGIN_BYPASS_ENABLED: true,
        REVIEW_LOGIN_PHONE: MERCHANT_PHONE,
      } as Partial<Env>),
    );
    assert.equal(noOtp.isReviewLogin(MERCHANT_PHONE), false);
  });

  it("getReviewOtp throws when the OTP is not configured (defence in depth)", () => {
    const svc = createPartnerReviewLoginService(
      makeEnv({ REVIEW_LOGIN_BYPASS_ENABLED: true, REVIEW_LOGIN_PHONE: MERCHANT_PHONE } as Partial<Env>),
    );
    assert.throws(() => svc.getReviewOtp(), /REVIEW_LOGIN_FIXED_OTP/);
  });
});

describe("Customer app review login bypass (GOOGLE_REVIEW_*) is independent", () => {
  it("enabling the merchant bypass does NOT enable the customer one", () => {
    const customer = createReviewModeService(merchantOn());
    assert.equal(customer.isReviewLogin(MERCHANT_PHONE), false);
    assert.equal(customer.isReviewLogin(CUSTOMER_PHONE), false);
  });

  it("enabling the customer bypass does NOT enable the merchant one", () => {
    const env = makeEnv({
      GOOGLE_REVIEW_MODE: true,
      GOOGLE_REVIEW_PHONE: CUSTOMER_PHONE,
      GOOGLE_REVIEW_OTP: CUSTOMER_OTP,
    } as Partial<Env>);
    assert.equal(createPartnerReviewLoginService(env).isReviewLogin(MERCHANT_PHONE), false);
    assert.equal(createReviewModeService(env).isReviewLogin(CUSTOMER_PHONE), true);
  });

  it("each bypass only ever answers for its OWN phone", () => {
    const env = bothOn();
    const merchant = createPartnerReviewLoginService(env);
    const customer = createReviewModeService(env);

    assert.equal(merchant.isReviewLogin(MERCHANT_PHONE), true);
    assert.equal(merchant.isReviewLogin(CUSTOMER_PHONE), false, "merchant must not claim customer phone");

    assert.equal(customer.isReviewLogin(CUSTOMER_PHONE), true);
    assert.equal(customer.isReviewLogin(MERCHANT_PHONE), false, "customer must not claim merchant phone");
  });

  it("the two fixed OTPs are kept separate", () => {
    const env = bothOn();
    assert.equal(createPartnerReviewLoginService(env).getReviewOtp(), MERCHANT_OTP);
    assert.equal(createReviewModeService(env).getReviewOtp(), CUSTOMER_OTP);
  });
});

describe("matchReviewBypass (what the OTP route uses)", () => {
  it("routes each review phone to its own bypass, everything else to normal SMS", () => {
    const all = createReviewBypasses(bothOn());

    assert.equal(matchReviewBypass(all, MERCHANT_PHONE)?.app, "partner");
    assert.equal(matchReviewBypass(all, "+917367878981")?.app, "partner");
    assert.equal(matchReviewBypass(all, CUSTOMER_PHONE)?.app, "customer");
    assert.equal(matchReviewBypass(all, "+919876543210"), null, "normal user → real SMS");
  });

  it("returns null for every phone when both bypasses are disabled", () => {
    const all = createReviewBypasses(makeEnv());
    for (const p of [MERCHANT_PHONE, CUSTOMER_PHONE, "+919876543210"]) {
      assert.equal(matchReviewBypass(all, p), null);
    }
  });

  it("with only the merchant bypass on, the customer review phone gets normal SMS", () => {
    const all = createReviewBypasses(merchantOn());
    assert.equal(matchReviewBypass(all, MERCHANT_PHONE)?.app, "partner");
    assert.equal(matchReviewBypass(all, CUSTOMER_PHONE), null);
  });
});

describe("logging", () => {
  it("never crashes when the logger is undefined", () => {
    const svc = createPartnerReviewLoginService(merchantOn());
    assert.doesNotThrow(() =>
      svc.logReviewLogin(undefined, {
        phone: MERCHANT_PHONE,
        ip: null,
        stage: "request",
        ok: true,
      }),
    );
  });

  it("masks all but the trailing 4 digits and never logs the OTP", () => {
    const seen: Record<string, unknown>[] = [];
    const log = { info: (o: Record<string, unknown>) => seen.push(o) };
    const svc = createPartnerReviewLoginService(merchantOn());
    svc.logReviewLogin(log as never, {
      phone: "+917367878981",
      ip: "1.2.3.4",
      stage: "verify",
      ok: true,
    });
    assert.equal(seen.length, 1);
    const rec = seen[0]!;
    assert.equal(rec.phoneTail, "8981");
    assert.equal(rec.surface, "partner");
    // No appType passed here → falls back to the bypass surface.
    assert.equal(rec.appType, "partner");
    assert.equal(rec.event, "review_login_bypass");
    const serialised = JSON.stringify(rec);
    assert.equal(serialised.includes(MERCHANT_OTP), false, "OTP must never be logged");
    assert.equal(serialised.includes("7367878981"), false, "full phone must never be logged");
  });
});

describe("internals", () => {
  it("digitsOnly strips +, spaces and dashes", () => {
    assert.equal(__test.digitsOnly("+91 736-787-8981"), "917367878981");
    assert.equal(__test.digitsOnly(undefined), "");
  });

  it("phonesEqual needs a full aligned 10-digit tail", () => {
    assert.equal(__test.phonesEqual("+917367878981", "7367878981"), true);
    assert.equal(__test.phonesEqual("7367878981", "7367878980"), false);
    assert.equal(__test.phonesEqual("878981", "878981"), false, "short values must not match");
    assert.equal(__test.phonesEqual("", "7367878981"), false);
  });
});

describe("Partner bypass serves BOTH merchant and rider (Rider app coverage)", () => {
  const PARTNER_PHONE = MERCHANT_PHONE; // same review number for merchant + rider
  const partnerOn = () =>
    makeEnv({
      REVIEW_LOGIN_BYPASS_ENABLED: true,
      REVIEW_LOGIN_PHONE: PARTNER_PHONE,
      REVIEW_LOGIN_FIXED_OTP: MERCHANT_OTP,
    } as Partial<Env>);

  it("disabled by default → rider review phone uses the normal SMS flow", () => {
    const all = createReviewBypasses(makeEnv());
    assert.equal(matchReviewBypass(all, PARTNER_PHONE), null);
  });

  it("enabled → the SAME phone is matched regardless of which app (merchant or rider) sends it", () => {
    // The OTP request has no appType; the phone is the only discriminator, and it
    // resolves to the one partner bypass for both apps.
    const all = createReviewBypasses(partnerOn());
    const bypass = matchReviewBypass(all, PARTNER_PHONE);
    assert.ok(bypass, "review phone must resolve to a bypass");
    assert.equal(bypass!.app, "partner");
    assert.equal(bypass!.getReviewOtp(), MERCHANT_OTP);
  });

  it("SECURITY: the fixed OTP never applies to any other rider number", () => {
    const svc = createPartnerReviewLoginService(partnerOn());
    for (const other of ["+919876543210", "9876543210", "7367878980", "+917367878982"]) {
      assert.equal(svc.isReviewLogin(other), false, `${other} must use the normal SMS flow`);
    }
  });

  it("verify-stage log records the CONCRETE app (merchant vs rider), not just the surface", () => {
    const svc = createPartnerReviewLoginService(partnerOn());
    const forApp = (appType: string) => {
      const seen: Record<string, unknown>[] = [];
      const log = { info: (o: Record<string, unknown>) => seen.push(o) };
      svc.logReviewLogin(log as never, {
        phone: `+91${PARTNER_PHONE}`,
        ip: "1.2.3.4",
        stage: "verify",
        ok: true,
        appType,
      });
      return seen[0]!;
    };

    const rider = forApp("rider");
    assert.equal(rider.surface, "partner");
    assert.equal(rider.appType, "rider");
    assert.equal(rider.phoneTail, "8981");
    assert.equal(JSON.stringify(rider).includes(MERCHANT_OTP), false, "OTP must never be logged");

    const merchant = forApp("merchant");
    assert.equal(merchant.appType, "merchant");
  });

  it("request-stage log (no appType) falls back to the bypass surface", () => {
    const svc = createPartnerReviewLoginService(partnerOn());
    const seen: Record<string, unknown>[] = [];
    const log = { info: (o: Record<string, unknown>) => seen.push(o) };
    svc.logReviewLogin(log as never, {
      phone: PARTNER_PHONE,
      ip: null,
      stage: "request",
      ok: true,
    });
    assert.equal(seen[0]!.appType, "partner");
    assert.equal(seen[0]!.surface, "partner");
  });

  it("a rider on the review phone does NOT trip the customer bypass and vice-versa", () => {
    const all = createReviewBypasses(
      partnerOn(),
    );
    // customer bypass is off here → customer review phone falls through to SMS
    assert.equal(matchReviewBypass(all, CUSTOMER_PHONE), null);
    // partner review phone resolves to the partner bypass only
    assert.equal(matchReviewBypass(all, PARTNER_PHONE)!.app, "partner");
  });
});
