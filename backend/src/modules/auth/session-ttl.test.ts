import test from "node:test";
import assert from "node:assert/strict";
import { RIDER_SESSION_TTL_SEC, MERCHANT_SESSION_TTL_SEC } from "./session-ttl.js";

const DAY = 60 * 60 * 24;

test("rider session token is long-lived (not the old 7-day)", () => {
  // The old 7-day TTL made riders re-login whenever the refresh chain hiccupped across an app
  // kill. Guard against regressing to a short lifetime.
  assert.ok(RIDER_SESSION_TTL_SEC >= 30 * DAY, `rider TTL ${RIDER_SESSION_TTL_SEC}s must be >= 30 days`);
  assert.notEqual(RIDER_SESSION_TTL_SEC, 7 * DAY, "rider TTL must not be 7 days");
});

test("rider session TTL matches the merchant app (both stay signed in)", () => {
  assert.equal(RIDER_SESSION_TTL_SEC, MERCHANT_SESSION_TTL_SEC);
  assert.equal(RIDER_SESSION_TTL_SEC, 365 * DAY);
});
