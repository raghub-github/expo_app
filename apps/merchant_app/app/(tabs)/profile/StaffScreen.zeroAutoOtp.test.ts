/**
 * Source-level regression: StaffScreen OTP sheet must not send on open.
 * Run: node --import tsx --test apps/merchant_app/app/(tabs)/profile/StaffScreen.zeroAutoOtp.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "StaffScreen.tsx"), "utf8");

test("startOtpFlow opens sheet without calling sendMerchantActionOtp", () => {
  const m = src.match(
    /const startOtpFlow = \(action: OtpPurpose[\s\S]*?\n  \};/
  );
  assert.ok(m, "startOtpFlow not found");
  const body = m[0];
  assert.equal(/sendMerchantActionOtp\s*\(/.test(body), false);
  assert.match(body, /setOtpVisible\(true\)/);
  assert.match(body, /setOtpSentOnce\(false\)/);
});

test("OTP SMS only from sendOrResendOtp", () => {
  assert.match(src, /const sendOrResendOtp = async/);
  assert.match(src, /sendMerchantActionOtp\(token/);
  assert.match(src, /accessibilityLabel="Send OTP"/);
});
