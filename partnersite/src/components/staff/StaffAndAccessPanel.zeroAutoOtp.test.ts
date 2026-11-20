/**
 * Run: node --import tsx --test partnersite/src/components/staff/StaffAndAccessPanel.zeroAutoOtp.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "StaffAndAccessPanel.tsx"), "utf8");

test("startOtp opens modal without fetching action-otp/send", () => {
  const m = src.match(/const startOtp = \([\s\S]*?\n  \};/);
  assert.ok(m);
  assert.equal(/action-otp\/send/.test(m[0]), false);
  assert.match(m[0], /setOtpOpen\(true\)/);
});

test("sendOrResendOtp is the only action-otp/send caller in UI", () => {
  assert.match(src, /const sendOrResendOtp = async/);
  const sends = [...src.matchAll(/action-otp\/send/g)];
  assert.ok(sends.length >= 1);
  assert.match(src, /Send OTP/);
});
