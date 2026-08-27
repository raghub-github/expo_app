import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { SignJWT } from "jose";
import { createSecretKey } from "node:crypto";

// getEnv() validates the whole env schema, so load the real backend/.env for these tests.
// The takeover-token roundtrip is independent of the secret's value.
(function loadEnv() {
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    }
  } catch {
    /* ignore */
  }
})();

const { issueRiderTakeoverToken, verifyRiderTakeoverToken } = await import("./rider-takeover-token.ts");
const { buildRiderSessionConflictBody } = await import("./rider-session-conflict.ts");

const CLAIMS = { userId: "usr_42", riderId: 42, deviceId: "dev_abc123", phoneE164: "+919999900000" };

test("issue → verify roundtrip preserves the bound claims", async () => {
  const token = await issueRiderTakeoverToken(CLAIMS);
  const out = await verifyRiderTakeoverToken(token);
  assert.deepEqual(out, CLAIMS);
});

test("verify rejects a tampered token", async () => {
  const token = await issueRiderTakeoverToken(CLAIMS);
  const tampered = token.slice(0, -3) + (token.endsWith("aaa") ? "bbb" : "aaa");
  await assert.rejects(() => verifyRiderTakeoverToken(tampered));
});

test("verify rejects garbage", async () => {
  await assert.rejects(() => verifyRiderTakeoverToken("not-a-jwt"));
});

test("§30: a token WITHOUT the takeover purpose is rejected (a session token can't take over)", async () => {
  const secret = createSecretKey(Buffer.from(process.env.SUPABASE_JWT_SECRET!, "utf-8"));
  const sessionLike = await new SignJWT({ role: "rider", device_id: "dev_abc123", riderId: 42 })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("usr_42")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
  await assert.rejects(() => verifyRiderTakeoverToken(sessionLike), /not_a_takeover_token/);
});

test("§30: an expired takeover token is rejected", async () => {
  const secret = createSecretKey(Buffer.from(process.env.SUPABASE_JWT_SECRET!, "utf-8"));
  const past = Math.floor(Date.now() / 1000) - 3600;
  const expired = await new SignJWT({ purpose: "rider_device_takeover", device_id: "dev_abc123", riderId: 42, phone: "+919999900000" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject("usr_42")
    .setIssuedAt(past - 300)
    .setExpirationTime(past)
    .sign(secret);
  await assert.rejects(() => verifyRiderTakeoverToken(expired));
});

test("buildRiderSessionConflictBody shape (§21) exposes only safe fields", () => {
  const body = buildRiderSessionConflictBody(
    { sessionId: 7, deviceId: "dev_other", deviceLabel: "Samsung Galaxy", platform: "android", lastActiveAt: "2026-01-01T00:00:00.000Z" },
    "tok_123",
  );
  assert.equal(body.code, "SESSION_CONFLICT");
  assert.equal(body.error, "session_conflict");
  assert.equal(body.existingSession.sessionId, "7");
  assert.equal(body.existingSession.deviceLabel, "Samsung Galaxy");
  assert.equal(body.existingSession.platform, "android");
  assert.equal(body.takeoverToken, "tok_123");
  // Must NOT leak the raw deviceId or any sensitive identifier.
  assert.equal((body.existingSession as Record<string, unknown>).deviceId, undefined);
});
