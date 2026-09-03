/**
 * Consolidated ONBOARDING PATH matrix (§47, §48, §50, §51) — runs the real pipeline
 * (vehicle+docs → engine per service → onboarding decision) for the spec's enumerated
 * scenarios and asserts onboarding status + eligible/blocked services. Pure (no DB), using
 * the same resolvers production uses, so it is a fast regression net for the whole flow.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRiderServiceEligibility,
  type DocState,
  type EligibilityDecision,
  type EligibilityService,
  type OwnershipType,
  type VehicleClass,
} from "./eligibilityEngine.ts";
import { defaultPolicyForService, normalizeFuelKind } from "./serviceEligibilityDefaults.ts";
import { resolveOnboardingDecision, type OnboardingStatus } from "./onboardingEligibility.ts";

type Combo = {
  vehicleClass: VehicleClass | null;
  fuel?: string;
  ownership?: OwnershipType;
  dl: DocState;
  rc: DocState;
};

function servicesFor(c: Combo): Record<EligibilityService, EligibilityDecision> {
  const input = {
    vehicleClass: c.vehicleClass,
    vehicleType: null,
    fuelKind: normalizeFuelKind(c.fuel ?? "petrol"),
    ownership: c.ownership ?? "non_commercial",
    dl: c.dl,
    rc: c.rc,
  };
  return {
    food: resolveRiderServiceEligibility(input, defaultPolicyForService("food")),
    parcel: resolveRiderServiceEligibility(input, defaultPolicyForService("parcel")),
    person_ride: resolveRiderServiceEligibility(input, defaultPolicyForService("person_ride")),
  };
}

function onboard(
  c: Combo,
  opts?: { paid?: boolean; identityVerified?: boolean; allowZero?: boolean }
) {
  return resolveOnboardingDecision({
    identityVerified: opts?.identityVerified ?? true,
    identitySubmitted: true,
    identityInManualReview: false,
    hasVehicle: c.vehicleClass != null,
    paymentCompleted: opts?.paid ?? false,
    services: servicesFor(c),
    allowZeroServiceEligibility: opts?.allowZero ?? true,
  });
}

const elig = (c: Combo) =>
  Object.entries(servicesFor(c))
    .filter(([, d]) => d.eligible)
    .map(([s]) => s)
    .sort();

/* ── §48: service eligibility for the key vehicle × document combinations (defaults) ── */

test("MATRIX §48: default-policy eligibility per vehicle × documents", () => {
  // 2W petrol, no docs → food only (DL+RC optional for food).
  assert.deepEqual(elig({ vehicleClass: "2_wheeler", dl: "missing", rc: "missing" }), ["food"]);
  // 2W petrol, DL+RC verified, non-commercial → food + parcel (ride needs commercial).
  assert.deepEqual(
    elig({ vehicleClass: "2_wheeler", dl: "verified", rc: "verified" }),
    ["food", "parcel"]
  );
  // 2W commercial, DL+RC verified → all three.
  assert.deepEqual(
    elig({ vehicleClass: "2_wheeler", dl: "verified", rc: "verified", ownership: "commercial" }),
    ["food", "parcel", "person_ride"]
  );
  // 3W commercial, DL+RC verified → parcel + person (never food).
  assert.deepEqual(
    elig({ vehicleClass: "3_wheeler", dl: "verified", rc: "verified", ownership: "commercial" }),
    ["parcel", "person_ride"]
  );
  // 4W commercial, DL+RC verified → parcel + person (never food).
  assert.deepEqual(
    elig({ vehicleClass: "4_wheeler", dl: "verified", rc: "verified", ownership: "commercial" }),
    ["parcel", "person_ride"]
  );
  // EV 2W commercial, DL+RC verified → all three (EV never blocked).
  assert.deepEqual(
    elig({ vehicleClass: "2_wheeler", fuel: "electric", dl: "verified", rc: "verified", ownership: "commercial" }),
    ["food", "parcel", "person_ride"]
  );
});

/* ── §47: onboarding paths A–M ──────────────────────────────────────────────────────── */

test("MATRIX §47: onboarding paths reach the right status", () => {
  const expect = (c: Combo, status: OnboardingStatus, paid = false) =>
    assert.equal(onboard(c, { paid }).status, status);

  // E. Petrol + RC verified + DL missing → ready, then limited after pay.
  expect({ vehicleClass: "2_wheeler", dl: "missing", rc: "verified" }, "READY_FOR_PAYMENT");
  expect({ vehicleClass: "2_wheeler", dl: "missing", rc: "verified" }, "COMPLETE_LIMITED", true);
  // H. Petrol + DL+RC verified (2W) → paid → limited (ride needs commercial), still onboarded.
  expect({ vehicleClass: "2_wheeler", dl: "verified", rc: "verified" }, "COMPLETE_LIMITED", true);
  // Fully eligible (2W commercial, all verified) → COMPLETE_FULL after pay.
  expect(
    { vehicleClass: "2_wheeler", dl: "verified", rc: "verified", ownership: "commercial" },
    "COMPLETE_FULL",
    true
  );
  // A/B. EV, no DL, RC verified → food eligible → ready.
  expect({ vehicleClass: "2_wheeler", fuel: "electric", dl: "missing", rc: "verified" }, "READY_FOR_PAYMENT");
  // No vehicle → INCOMPLETE.
  expect({ vehicleClass: null, dl: "missing", rc: "missing" }, "INCOMPLETE");
});

test("MATRIX §47: zero-eligibility gate — 3W with no docs (food impossible) blocks unless policy allows", () => {
  const combo: Combo = { vehicleClass: "3_wheeler", dl: "missing", rc: "missing" };
  assert.deepEqual(elig(combo), []); // nothing eligible (food is 2W-only; parcel/ride need docs)
  assert.equal(onboard(combo, { allowZero: false }).status, "BLOCKED");
  assert.equal(onboard(combo, { allowZero: true }).status, "READY_FOR_PAYMENT");
});

/* ── §50/§51: vehicle change and service (document) change recompute deterministically ─ */

test("MATRIX §50: EV→Petrol and 2W→3W recompute eligibility", () => {
  // 2W EV no-RC food rider…
  const before = elig({ vehicleClass: "2_wheeler", fuel: "electric", dl: "missing", rc: "missing" });
  assert.deepEqual(before, ["food"]);
  // …switches to a 3W (no longer food-eligible) with no docs → nothing eligible.
  const after = elig({ vehicleClass: "3_wheeler", fuel: "petrol", dl: "missing", rc: "missing" });
  assert.deepEqual(after, []);
});

test("MATRIX §51: submitting DL+RC upgrades a 2W food rider to food+parcel (deterministic)", () => {
  const before = elig({ vehicleClass: "2_wheeler", dl: "missing", rc: "missing" });
  const after = elig({ vehicleClass: "2_wheeler", dl: "verified", rc: "verified" });
  assert.deepEqual(before, ["food"]);
  assert.deepEqual(after, ["food", "parcel"]);
  // Determinism (§57): repeated evaluation is identical.
  assert.deepEqual(elig({ vehicleClass: "2_wheeler", dl: "verified", rc: "verified" }), after);
});
