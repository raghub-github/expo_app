import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vehicleClassFromCategory,
  ownershipFromVehicle,
  docStateFrom,
  rcDocStateFromVehicle,
} from "./riderEligibilityInputs.ts";

test("vehicleClassFromCategory maps normalised + legacy categories", () => {
  assert.equal(vehicleClassFromCategory("2_wheeler"), "2_wheeler");
  assert.equal(vehicleClassFromCategory("bike"), "2_wheeler");
  assert.equal(vehicleClassFromCategory("3_wheeler"), "3_wheeler");
  assert.equal(vehicleClassFromCategory("auto"), "3_wheeler");
  assert.equal(vehicleClassFromCategory("4_wheeler"), "4_wheeler");
  assert.equal(vehicleClassFromCategory("cab"), "4_wheeler");
  assert.equal(vehicleClassFromCategory(null), null);
});

test("vehicleClassFromCategory falls back to the vehicle type code", () => {
  assert.equal(vehicleClassFromCategory(null, "ev_bike"), "2_wheeler");
});

test("ownershipFromVehicle maps the commercial flag", () => {
  assert.equal(ownershipFromVehicle(true), "commercial");
  assert.equal(ownershipFromVehicle(false), "non_commercial");
  assert.equal(ownershipFromVehicle(null), "non_commercial");
});

test("rcDocStateFromVehicle: per-vehicle RC state from verified + fitness/permit validity", () => {
  const now = new Date("2026-06-15T00:00:00Z");
  // Unverified vehicle row (RC submitted, awaiting) → pending, never missing.
  assert.equal(rcDocStateFromVehicle({ verified: false }, now), "pending");
  // Verified, no expiry → verified.
  assert.equal(rcDocStateFromVehicle({ verified: true }, now), "verified");
  // Verified but fitness expired → expired.
  assert.equal(
    rcDocStateFromVehicle({ verified: true, fitnessExpiry: "2026-01-01" }, now),
    "expired"
  );
  // Verified, permit expired → expired.
  assert.equal(
    rcDocStateFromVehicle({ verified: true, permitExpiry: "2025-12-31" }, now),
    "expired"
  );
  // Verified, expiries in the future → verified.
  assert.equal(
    rcDocStateFromVehicle({ verified: true, fitnessExpiry: "2027-01-01", permitExpiry: "2027-01-01" }, now),
    "verified"
  );
});

test("docStateFrom prioritises expired > verified > rejected > pending > missing", () => {
  assert.equal(docStateFrom({ verified: true, expired: true }), "expired");
  assert.equal(docStateFrom({ verified: true }), "verified");
  assert.equal(docStateFrom({ rejected: true }), "failed");
  assert.equal(docStateFrom({ submitted: true }), "pending");
  assert.equal(docStateFrom({}), "missing");
});
