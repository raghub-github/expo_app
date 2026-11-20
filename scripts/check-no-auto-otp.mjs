#!/usr/bin/env node
/**
 * Static guard: fail if OTP SMS dispatch appears inside React lifecycle effects.
 *
 * Run: node scripts/check-no-auto-otp.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "android",
  "ios",
  ".expo",
]);

const OTP_CALL =
  /\b(sendOtp|signInWithOtp|sendMerchantActionOtp|requestPhoneOTP|requestOtpSms|msg91SendOtp|deliverSupabaseOtpViaMsg91|sendSmsViaMsg91)\s*\(/;

const EFFECT_START = /\b(useEffect|useFocusEffect|useLayoutEffect)\s*\(/;

const violations = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(name)) scanFile(p);
  }
}

/** Extract the first arrow/function body starting at `start` (index of '{'). */
function extractBlock(text, start) {
  if (text[start] !== "{") return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function scanFile(file) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  if (
    rel.includes("/api/") ||
    rel.includes("/modules/") ||
    rel.includes("/services/") ||
    rel.includes("/lib/server/") ||
    rel.includes("/lib/staff/") ||
    rel.includes("merchant-action-otp") ||
    rel.includes("msg91") ||
    rel.includes("otpSendGuard") ||
    rel.includes("sms-send-guard") ||
    rel.includes(".test.") ||
    rel.includes(".spec.")
  ) {
    return;
  }

  const text = readFileSync(file, "utf8");

  if (/isAuto\s*:\s*true/.test(text) && OTP_CALL.test(text)) {
    violations.push({
      file: rel,
      line: 0,
      snippet: "isAuto: true with OTP send — forbidden",
    });
  }

  let searchFrom = 0;
  while (searchFrom < text.length) {
    const m = EFFECT_START.exec(text.slice(searchFrom));
    if (!m) break;
    const abs = searchFrom + m.index;
    const after = text.slice(abs + m[0].length);
    // Find first `{` of the effect callback.
    const braceRel = after.search(/=>\s*\{|\(\)\s*=>\s*\{|function\s*\([^)]*\)\s*\{/);
    if (braceRel < 0) {
      searchFrom = abs + m[0].length;
      continue;
    }
    const openBrace = abs + m[0].length + after.slice(braceRel).indexOf("{");
    const body = extractBlock(text, openBrace);
    searchFrom = abs + m[0].length;
    if (!body) continue;
    // Ignore comments so prose like "same gate as email OTP sendOtp()" is not a hit.
    const codeOnly = body
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
    if (!OTP_CALL.test(codeOnly)) continue;
    const line = text.slice(0, abs).split(/\r?\n/).length;
    violations.push({
      file: rel,
      line,
      snippet: text.slice(abs, abs + 80).replace(/\s+/g, " "),
    });
  }
}

walk(ROOT);

if (violations.length) {
  console.error("FAIL: automatic OTP dispatch patterns detected:\n");
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.snippet}`);
  }
  console.error(
    `\n${violations.length} violation(s). OTP SMS must only run from explicit user button handlers.`
  );
  process.exit(1);
}

console.log("OK: no OTP send calls found inside lifecycle effects (static check).");
