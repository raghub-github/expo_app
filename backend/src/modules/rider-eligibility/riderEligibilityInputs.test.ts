import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vehicleClassFromCategory,
  ownershipFromVehicle,
  docStateFrom,
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

test("docStateFrom prioritises expired > verified > rejected > pending > missing", () => {
  assert.equal(docStateFrom({ verified: true, expired: true }), "expired");
  assert.equal(docStateFrom({ verified: true }), "verified");
  assert.equal(docStateFrom({ rejected: true }), "failed");
  assert.equal(docStateFrom({ submitted: true }), "pending");
  assert.equal(docStateFrom({}), "missing");
});
