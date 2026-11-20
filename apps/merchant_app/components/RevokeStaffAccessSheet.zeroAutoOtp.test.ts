/**
 * Source-level regression: opening RevokeStaffAccessSheet must never auto-send OTP.
 * Run from repo root:
 *   node --import tsx --test apps/merchant_app/components/RevokeStaffAccessSheet.zeroAutoOtp.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "RevokeStaffAccessSheet.tsx"), "utf8");

test("RevokeStaffAccessSheet has no auto-send on visible / useEffect", () => {
  assert.equal(/isAuto\s*:\s*true/.test(src), false);

  // useEffect that runs on visible must not call sendMerchantActionOtp / sendOtp.
  const effectBlocks = [...src.matchAll(/useEffect\(\(\)\s*=>\s*\{([\s\S]*?)\},\s*\[[^\]]*\]\)/g)];
  assert.ok(effectBlocks.length >= 1, "expected at least one useEffect");
  for (const m of effectBlocks) {
    const body = m[1] ?? "";
    assert.equal(
      /sendOtp\s*\(/.test(body) || /sendMerchantActionOtp\s*\(/.test(body),
      false,
      "useEffect must not dispatch OTP SMS",
    );
  }
  assert.match(src, /Intentionally no OTP send on open/);
});

test("RevokeStaffAccessSheet requires explicit Send OTP / Resend OTP press handlers", () => {
  assert.match(src, /accessibilityLabel="Send OTP"/);
  assert.match(src, /accessibilityLabel="Resend OTP"/);
  assert.match(src, /onPress=\{\(\)\s*=>\s*void sendOtp\(\)\}/);
});
