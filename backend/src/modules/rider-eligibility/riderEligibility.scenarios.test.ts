/**
 * End-to-end REAL-WORLD scenario matrix for rider service eligibility.
 *
 * Unlike eligibilityEngine.test.ts (which exhaustively grids every input combination),
 * this suite reads like a spec: each case is a concrete rider (documents they submitted +
 * their vehicle) at a concrete location policy, asserting the exact decision AND the reason
 * codes an agent/rider would see. It exercises the real pipeline used in production:
 *   raw document rows  --docVerified-->  DocState (docStateFrom)
 *   raw vehicle fields --vehicleClassFromCategory/ownershipFromVehicle-->  engine input
 *   effective geo policy (defaults or an override)  -->  resolveRiderServiceEligibility
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRiderServiceEligibility,
  type EligibilityService,
  type ServiceEligibilityPolicy,
  type RiderEligibilityInput,
} from "./eligibilityEngine.ts";
import { defaultPolicyForService, normalizeFuelKind } from "./serviceEligibilityDefaults.ts";
import {
  docStateFrom,
  ownershipFromVehicle,
  vehicleClassFromCategory,
} from "./riderEligibilityInputs.ts";
import { docVerified } from "./riderEligibility.service.ts";

/* ── helpers that mirror how the service builds engine inputs from DB rows ─────────── */

type RawDoc = {
  verified: boolean | null;
  verificationMethod: string | null;
  verificationStatus: string | null;
  expired?: boolean;
};

function docStateFromRow(row: RawDoc | undefined) {
  const v = docVerified(row as never);
  return docStateFrom({ ...v, expired: row?.expired ?? false });
}

function buildInput(args: {
  vehicleCategory?: string | null;
  vehicleType?: string | null;
  fuel?: string | null;
  isCommercial?: boolean;
  dl?: RawDoc;
  rc?: RawDoc;
  noVehicle?: boolean;
}): RiderEligibilityInput {
  return {
    vehicleClass: args.noVehicle
      ? null
      : vehicleClassFromCategory(args.vehicleCategory ?? null, args.vehicleType ?? null),
    vehicleType: args.vehicleType ?? null,
    fuelKind: normalizeFuelKind(args.fuel ?? null),
    ownership: ownershipFromVehicle(args.isCommercial ?? false),
    dl: docStateFromRow(args.dl),
    rc: docStateFromRow(args.rc),
  };
}

function policy(
  service: EligibilityService,
  overrides: Partial<ServiceEligibilityPolicy> = {}
): ServiceEligibilityPolicy {
  return { ...defaultPolicyForService(service), ...overrides };
}

/** A DL/RC that Cashfree auto-verified (verified flag not set, status auto_verified). */
const CASHFREE_AUTOVERIFIED: RawDoc = {
  verified: false,
  verificationMethod: "CASHFREE_DL",
  verificationStatus: "auto_verified",
};
const MANUAL_APPROVED: RawDoc = {
  verified: true,
  verificationMethod: "manual",
  verificationStatus: "approved",
};
const SUBMITTED_PENDING: RawDoc = {
  verified: false,
  verificationMethod: "manual",
  verificationStatus: "pending",
};
const REJECTED: RawDoc = {
  verified: false,
  verificationMethod: "manual",
  verificationStatus: "rejected",
};
const EXPIRED_BUT_WAS_VERIFIED: RawDoc = {
  verified: true,
  verificationMethod: "CASHFREE_DL",
  verificationStatus: "auto_verified",
  expired: true,
};

function codes(decision: { blocking: { code: string }[] }): string[] {
  return decision.blocking.map((b) => b.code);
}

/* ── Document-verification contract (the DL-fix core) ──────────────────────────────── */

test("SCENARIO: Cashfree auto-verified DL counts as verified (no back-photo/manual needed)", () => {
  assert.equal(docStateFromRow(CASHFREE_AUTOVERIFIED), "verified");
  assert.equal(docStateFromRow(MANUAL_APPROVED), "verified");
  assert.equal(docStateFromRow(SUBMITTED_PENDING), "pending");
  assert.equal(docStateFromRow(REJECTED), "failed");
  assert.equal(docStateFromRow(undefined), "missing");
  assert.equal(docStateFromRow(EXPIRED_BUT_WAS_VERIFIED), "expired");
});

/* ── FOOD (2-wheeler only, DL required, RC optional) ───────────────────────────────── */

test("SCENARIO: food · verified 2W bike, DL Cashfree-verified, NO RC → ELIGIBLE", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({ vehicleCategory: "2_wheeler", vehicleType: "bike", dl: CASHFREE_AUTOVERIFIED }),
    policy("food")
  );
  assert.equal(d.eligible, true);
  assert.deepEqual(codes(d), []);
});

test("SCENARIO: food · 3-wheeler auto → NOT eligible (food is 2W only)", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({ vehicleCategory: "3_wheeler", vehicleType: "auto", dl: MANUAL_APPROVED }),
    policy("food")
  );
  assert.equal(d.eligible, false);
  assert.ok(codes(d).includes("VEHICLE_CLASS_NOT_ALLOWED"));
});

test("SCENARIO: food · 2W but DL not submitted → NOT eligible (DL required)", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({ vehicleCategory: "2_wheeler", vehicleType: "bike" }),
    policy("food")
  );
  assert.equal(d.eligible, false);
  assert.ok(codes(d).includes("DL_REQUIRED_NOT_VERIFIED"));
});

test("SCENARIO: food · 2W, DL still pending manual review → NOT eligible (not verified yet)", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({ vehicleCategory: "2_wheeler", vehicleType: "bike", dl: SUBMITTED_PENDING }),
    policy("food")
  );
  assert.equal(d.eligible, false);
  assert.ok(codes(d).includes("DL_REQUIRED_NOT_VERIFIED"));
});

/* ── PARCEL (all classes, DL + RC required) ────────────────────────────────────────── */

test("SCENARIO: parcel · 2W, DL+RC verified → ELIGIBLE", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({
      vehicleCategory: "2_wheeler",
      vehicleType: "bike",
      dl: CASHFREE_AUTOVERIFIED,
      rc: CASHFREE_AUTOVERIFIED,
    }),
    policy("parcel")
  );
  assert.equal(d.eligible, true);
});

test("SCENARIO: parcel · 4W, DL+RC verified → ELIGIBLE (parcel allows all classes)", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({
      vehicleCategory: "4_wheeler",
      vehicleType: "cargo_van",
      dl: MANUAL_APPROVED,
      rc: MANUAL_APPROVED,
    }),
    policy("parcel")
  );
  assert.equal(d.eligible, true);
});

test("SCENARIO: parcel · DL verified but RC missing → NOT eligible (RC required)", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({ vehicleCategory: "2_wheeler", vehicleType: "bike", dl: MANUAL_APPROVED }),
    policy("parcel")
  );
  assert.equal(d.eligible, false);
  assert.ok(codes(d).includes("RC_REQUIRED_NOT_VERIFIED"));
});

/* ── PERSON RIDE (all classes, DL+RC required, commercial required BY DEFAULT) ─────── */

test("SCENARIO: person_ride · 4W COMMERCIAL, DL+RC verified (default policy) → ELIGIBLE", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({
      vehicleCategory: "4_wheeler",
      vehicleType: "cab-economy",
      isCommercial: true,
      dl: MANUAL_APPROVED,
      rc: MANUAL_APPROVED,
    }),
    policy("person_ride")
  );
  assert.equal(d.eligible, true);
});

test("SCENARIO: person_ride · 4W NON-commercial, docs verified (default) → NOT eligible (commercial required)", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({
      vehicleCategory: "4_wheeler",
      vehicleType: "car",
      isCommercial: false,
      dl: MANUAL_APPROVED,
      rc: MANUAL_APPROVED,
    }),
    policy("person_ride")
  );
  assert.equal(d.eligible, false);
  assert.ok(codes(d).includes("COMMERCIAL_VEHICLE_REQUIRED"));
});

test("SCENARIO: person_ride · same rider where the CITY does not require commercial → ELIGIBLE", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({
      vehicleCategory: "4_wheeler",
      vehicleType: "car",
      isCommercial: false,
      dl: MANUAL_APPROVED,
      rc: MANUAL_APPROVED,
    }),
    policy("person_ride", { commercialRequired: false, resolvedGeo: { level: "district", refId: "x" } })
  );
  assert.equal(d.eligible, true);
});

test("SCENARIO: person_ride · DL expired → NOT eligible with a renew action", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({
      vehicleCategory: "4_wheeler",
      vehicleType: "cab-economy",
      isCommercial: true,
      dl: EXPIRED_BUT_WAS_VERIFIED,
      rc: MANUAL_APPROVED,
    }),
    policy("person_ride")
  );
  assert.equal(d.eligible, false);
  assert.ok(codes(d).includes("DL_EXPIRED"));
  assert.match(d.blocking.find((b) => b.code === "DL_EXPIRED")!.requiredAction ?? "", /[Rr]enew/);
});

/* ── EV must NOT be hard-coded as "no RC"; fuel allow-lists are geo-configurable ────── */

test("SCENARIO: EV auto for person_ride with verified RC (city not requiring commercial) → ELIGIBLE (EV not blocked)", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({
      vehicleCategory: "3_wheeler",
      vehicleType: "ev_auto",
      fuel: "electric",
      isCommercial: true,
      dl: MANUAL_APPROVED,
      rc: MANUAL_APPROVED,
    }),
    policy("person_ride")
  );
  assert.equal(d.eligible, true);
  assert.equal(d.fuelKind, "ev");
});

test("SCENARIO: city restricts person_ride to EV only; a petrol cab → NOT eligible (fuel not allowed)", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({
      vehicleCategory: "4_wheeler",
      vehicleType: "cab-economy",
      fuel: "petrol",
      isCommercial: true,
      dl: MANUAL_APPROVED,
      rc: MANUAL_APPROVED,
    }),
    policy("person_ride", { allowedFuelKinds: ["ev"] })
  );
  assert.equal(d.eligible, false);
  assert.ok(codes(d).includes("FUEL_NOT_ALLOWED"));
});

/* ── Geo enablement + multi-block collection ───────────────────────────────────────── */

test("SCENARIO: service switched OFF at this location blocks even a perfectly-documented rider", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({
      vehicleCategory: "2_wheeler",
      vehicleType: "bike",
      dl: MANUAL_APPROVED,
      rc: MANUAL_APPROVED,
    }),
    policy("food", { serviceEnabled: false })
  );
  assert.equal(d.eligible, false);
  assert.ok(codes(d).includes("SERVICE_DISABLED"));
});

test("SCENARIO: brand-new rider (no vehicle, no docs) collects ALL relevant blocks, not just one", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({ noVehicle: true }),
    policy("person_ride")
  );
  assert.equal(d.eligible, false);
  const c = codes(d);
  assert.ok(c.includes("NO_VEHICLE"));
  assert.ok(c.includes("DL_REQUIRED_NOT_VERIFIED"));
  assert.ok(c.includes("RC_REQUIRED_NOT_VERIFIED"));
  // Every block carries a human reason.
  assert.ok(d.blocking.every((b) => typeof b.reason === "string" && b.reason.length > 0));
});

test("SCENARIO: a rejected DL is treated as failed (not merely missing) and blocks a DL-required service", () => {
  const d = resolveRiderServiceEligibility(
    buildInput({ vehicleCategory: "2_wheeler", vehicleType: "bike", dl: REJECTED }),
    policy("food")
  );
  assert.equal(d.eligible, false);
  assert.equal(d.dlState, "failed");
  assert.ok(codes(d).includes("DL_REQUIRED_NOT_VERIFIED"));
});

/* ── A realistic mixed rider evaluated across ALL THREE services at once ────────────── */

test("SCENARIO: 2W bike rider, DL verified + RC missing → food YES, parcel NO, ride NO (one profile, three answers)", () => {
  const input = buildInput({
    vehicleCategory: "2_wheeler",
    vehicleType: "bike",
    isCommercial: false,
    dl: CASHFREE_AUTOVERIFIED,
    // no RC submitted
  });
  const food = resolveRiderServiceEligibility(input, policy("food"));
  const parcel = resolveRiderServiceEligibility(input, policy("parcel"));
  const ride = resolveRiderServiceEligibility(input, policy("person_ride"));

  assert.equal(food.eligible, true, "food: 2W + DL verified, RC optional");
  assert.equal(parcel.eligible, false, "parcel: RC required");
  assert.ok(codes(parcel).includes("RC_REQUIRED_NOT_VERIFIED"));
  assert.equal(ride.eligible, false, "ride: RC required + commercial required");
  assert.ok(codes(ride).includes("RC_REQUIRED_NOT_VERIFIED"));
  assert.ok(codes(ride).includes("COMMERCIAL_VEHICLE_REQUIRED"));
});
