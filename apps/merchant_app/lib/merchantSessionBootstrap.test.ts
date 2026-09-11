import { test } from "node:test";
import assert from "node:assert/strict";
import { decideInitialAuth } from "./merchantSessionBootstrap";

const NOW = 1_800_000_000; // fixed nowSec
const YEAR = 60 * 60 * 24 * 365;

test("valid token + cached partner → optimistic authenticate (no blocking network)", () => {
  const d = decideInitialAuth({
    token: "jwt-abc",
    expiresAtSec: NOW + YEAR,
    hasCachedPartner: true,
    nowSec: NOW,
  });
  assert.deepEqual(d, { kind: "authenticated", token: "jwt-abc" });
});

test("token is trimmed", () => {
  const d = decideInitialAuth({
    token: "  jwt-abc  ",
    expiresAtSec: NOW + YEAR,
    hasCachedPartner: true,
    nowSec: NOW,
  });
  assert.deepEqual(d, { kind: "authenticated", token: "jwt-abc" });
});

test("no token → unauthenticated", () => {
  assert.deepEqual(
    decideInitialAuth({ token: null, expiresAtSec: null, hasCachedPartner: false, nowSec: NOW }),
    { kind: "unauthenticated" }
  );
  assert.deepEqual(
    decideInitialAuth({ token: "   ", expiresAtSec: NOW + YEAR, hasCachedPartner: true, nowSec: NOW }),
    { kind: "unauthenticated" }
  );
});

test("token but no cached partner → validate (must fetch /me once)", () => {
  assert.deepEqual(
    decideInitialAuth({ token: "jwt", expiresAtSec: NOW + YEAR, hasCachedPartner: false, nowSec: NOW }),
    { kind: "validate" }
  );
});

test("locally expired token (beyond skew) → validate (let forced refresh decide)", () => {
  assert.deepEqual(
    decideInitialAuth({ token: "jwt", expiresAtSec: NOW - 600, hasCachedPartner: true, nowSec: NOW }),
    { kind: "validate" }
  );
});

test("null expiry (unknown) is treated as still valid → optimistic authenticate", () => {
  // Legacy sessions without a stored expiry must not be forced through a blocking validate.
  assert.deepEqual(
    decideInitialAuth({ token: "jwt", expiresAtSec: null, hasCachedPartner: true, nowSec: NOW }),
    { kind: "authenticated", token: "jwt" }
  );
});

test("clock-skew grace: token expiring within the skew window is NOT treated as expired", () => {
  // exp is 30s in the past but within default 60s skew → still authenticate optimistically.
  assert.deepEqual(
    decideInitialAuth({ token: "jwt", expiresAtSec: NOW - 30, hasCachedPartner: true, nowSec: NOW }),
    { kind: "authenticated", token: "jwt" }
  );
  // Beyond the skew → validate.
  assert.deepEqual(
    decideInitialAuth({
      token: "jwt",
      expiresAtSec: NOW - 120,
      hasCachedPartner: true,
      nowSec: NOW,
      clockSkewSec: 60,
    }),
    { kind: "validate" }
  );
});
