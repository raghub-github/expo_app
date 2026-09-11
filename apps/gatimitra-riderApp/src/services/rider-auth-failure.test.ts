import { test } from "node:test";
import assert from "node:assert/strict";
import { isAuthRejectionMessage, isDefiniteRiderSessionRevocation } from "./rider-auth-failure";

test("isAuthRejectionMessage: transient/network failures are NOT auth rejections (keep session)", () => {
  for (const m of [
    "Request timeout after 30000ms",
    "Network request failed",
    "Failed to fetch",
    "The request was aborted",
    "ECONNRESET",
    "socket hang up",
    "",
    null,
    undefined,
  ]) {
    assert.equal(isAuthRejectionMessage(m as string), false, `expected keep-session for: ${String(m)}`);
  }
});

test("isAuthRejectionMessage: definite auth rejections ARE rejections (sign out)", () => {
  for (const m of [
    "HTTP 401 Unauthorized",
    "Your login has expired",
    "token is invalid",
    "Signed out from this device (session revoked)",
    "Rider not found",
    "session no longer valid",
  ]) {
    assert.equal(isAuthRejectionMessage(m), true, `expected sign-out for: ${m}`);
  }
});

test("isAuthRejectionMessage: a timeout that also contains 'invalid' still counts as transient", () => {
  // Network signature wins — never sign out on a timeout.
  assert.equal(isAuthRejectionMessage("Network request failed (invalid state)"), false);
});

test("isDefiniteRiderSessionRevocation: only 401 + known codes revoke", () => {
  assert.equal(isDefiniteRiderSessionRevocation(401, "invalid_token", ""), true);
  assert.equal(
    isDefiniteRiderSessionRevocation(401, "session_revoked", "Signed out from this device."),
    true
  );
  assert.equal(
    isDefiniteRiderSessionRevocation(401, "session_revoked", "Signed out from all devices."),
    true
  );
});

test("isDefiniteRiderSessionRevocation: non-401 / unknown / ambiguous do NOT revoke", () => {
  assert.equal(isDefiniteRiderSessionRevocation(500, "invalid_token", ""), false); // not a 401
  assert.equal(isDefiniteRiderSessionRevocation(403, "forbidden", ""), false);
  assert.equal(isDefiniteRiderSessionRevocation(401, "rate_limited", ""), false);
  assert.equal(isDefiniteRiderSessionRevocation(401, "session_revoked", "temporary glitch"), false);
  assert.equal(isDefiniteRiderSessionRevocation(401, null, null), false);
});
