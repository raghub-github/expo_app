import test from "node:test";
import assert from "node:assert/strict";
import { evaluateRiderAcceptRevalidation } from "./rider-accept-revalidation.js";

const STALE_MAX = 900; // seconds
const RADIUS = 3000; // meters

test("fresh + inside radius → allow", () => {
  assert.deepEqual(
    evaluateRiderAcceptRevalidation({ hasGps: true, gpsAgeSeconds: 20, distanceMeters: 1200, radiusMeters: RADIUS, staleMaxSeconds: STALE_MAX }),
    { allow: true, reason: "ok" }
  );
});

test("no GPS → reject location_missing", () => {
  assert.deepEqual(
    evaluateRiderAcceptRevalidation({ hasGps: false, gpsAgeSeconds: Infinity, distanceMeters: 100, radiusMeters: RADIUS, staleMaxSeconds: STALE_MAX }),
    { allow: false, reason: "location_missing" }
  );
});

test("GPS older than the stale window → reject location_stale (even if inside radius)", () => {
  assert.deepEqual(
    evaluateRiderAcceptRevalidation({ hasGps: true, gpsAgeSeconds: STALE_MAX + 1, distanceMeters: 100, radiusMeters: RADIUS, staleMaxSeconds: STALE_MAX }),
    { allow: false, reason: "location_stale" }
  );
});

test("moved outside the pickup radius → reject outside_pickup_radius", () => {
  assert.deepEqual(
    evaluateRiderAcceptRevalidation({ hasGps: true, gpsAgeSeconds: 30, distanceMeters: RADIUS + 1, radiusMeters: RADIUS, staleMaxSeconds: STALE_MAX }),
    { allow: false, reason: "outside_pickup_radius" }
  );
});

test("exactly on the radius boundary → allowed (inclusive)", () => {
  assert.deepEqual(
    evaluateRiderAcceptRevalidation({ hasGps: true, gpsAgeSeconds: 30, distanceMeters: RADIUS, radiusMeters: RADIUS, staleMaxSeconds: STALE_MAX }),
    { allow: true, reason: "ok" }
  );
});

test("stale is checked before radius (a stale rider is rejected for staleness, not distance)", () => {
  const d = evaluateRiderAcceptRevalidation({ hasGps: true, gpsAgeSeconds: STALE_MAX + 100, distanceMeters: RADIUS + 5000, radiusMeters: RADIUS, staleMaxSeconds: STALE_MAX });
  assert.equal(d.reason, "location_stale");
});

test("non-positive/invalid radius → fail-open on radius (freshness still enforced)", () => {
  // Unknown radius must not silently reject — dispatch already gated radius at offer time.
  assert.deepEqual(
    evaluateRiderAcceptRevalidation({ hasGps: true, gpsAgeSeconds: 30, distanceMeters: 999999, radiusMeters: 0, staleMaxSeconds: STALE_MAX }),
    { allow: true, reason: "ok" }
  );
  // ...but a stale fix is still rejected regardless of radius.
  assert.equal(
    evaluateRiderAcceptRevalidation({ hasGps: true, gpsAgeSeconds: STALE_MAX + 1, distanceMeters: 10, radiusMeters: 0, staleMaxSeconds: STALE_MAX }).reason,
    "location_stale"
  );
});
