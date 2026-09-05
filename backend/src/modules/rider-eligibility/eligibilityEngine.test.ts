/**
 * Rider Service Eligibility — full deterministic matrix (Phases 39–44).
 * Document verification ≠ eligibility; vehicle/fuel/commercial + geo policy decide.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRiderServiceEligibility,
  type RiderEligibilityInput,
  type ServiceEligibilityPolicy,
  type DocState,
  type VehicleClass,
  type OwnershipType,
} from "./eligibilityEngine.ts";
import { defaultPolicyForService, normalizeFuelKind } from "./serviceEligibilityDefaults.ts";

function input(over: Partial<RiderEligibilityInput> = {}): RiderEligibilityInput {
  return {
    vehicleClass: "2_wheeler",
    vehicleType: "bike",
    fuelKind: "petrol",
    ownership: "non_commercial",
    dl: "verified",
    rc: "verified",
    ...over,
  };
}
function codes(policy: ServiceEligibilityPolicy, inp: RiderEligibilityInput) {
  return resolveRiderServiceEligibility(inp, policy).blocking.map((b) => b.code);
}

// ── FOOD ────────────────────────────────────────────────────────────────
test("FOOD: 2-wheeler with verified DL is eligible; 3W/4W never eligible", () => {
  const food = defaultPolicyForService("food");
  assert.equal(resolveRiderServiceEligibility(input({ vehicleClass: "2_wheeler" }), food).eligible, true);
  assert.deepEqual(codes(food, input({ vehicleClass: "3_wheeler" })), ["VEHICLE_CLASS_NOT_ALLOWED"]);
  assert.deepEqual(codes(food, input({ vehicleClass: "4_wheeler" })), ["VEHICLE_CLASS_NOT_ALLOWED"]);
});

test("FOOD: valid documents on a 3W do NOT make it food-eligible (verification ≠ eligibility)", () => {
  const food = defaultPolicyForService("food");
  const d = resolveRiderServiceEligibility(input({ vehicleClass: "3_wheeler", dl: "verified", rc: "verified" }), food);
  assert.equal(d.eligible, false);
  assert.ok(d.blocking.some((b) => b.code === "VEHICLE_CLASS_NOT_ALLOWED"));
});

test("FOOD (default): DL + RC are OPTIONAL — a 2-wheeler with no documents is eligible", () => {
  const food = defaultPolicyForService("food");
  // Lowest-barrier onboarding: neither missing DL nor missing RC blocks food by default.
  assert.deepEqual(codes(food, input({ dl: "missing", rc: "missing" })), []);
  assert.equal(resolveRiderServiceEligibility(input({ dl: "missing", rc: "missing" }), food).eligible, true);
  // Even a failed DL doesn't block food while DL is optional.
  assert.equal(resolveRiderServiceEligibility(input({ dl: "failed", rc: "missing" }), food).eligible, true);
});

test("FOOD (admin override): ownership proof required is satisfied when RC/ownership is verified", () => {
  const food = { ...defaultPolicyForService("food"), ownershipProofRequirement: "required" as const };
  assert.deepEqual(codes(food, input({ ownershipProof: "missing" })), ["OWNERSHIP_PROOF_REQUIRED_NOT_VERIFIED"]);
  assert.equal(resolveRiderServiceEligibility(input({ ownershipProof: "verified" }), food).eligible, true);
});

// ── PARCEL ──────────────────────────────────────────────────────────────
test("PARCEL: 2W/3W/4W all allowed; DL + RC both required", () => {
  const parcel = defaultPolicyForService("parcel");
  for (const vc of ["2_wheeler", "3_wheeler", "4_wheeler"] as VehicleClass[]) {
    assert.equal(resolveRiderServiceEligibility(input({ vehicleClass: vc }), parcel).eligible, true, vc);
  }
  assert.deepEqual(codes(parcel, input({ dl: "missing" })), ["DL_REQUIRED_NOT_VERIFIED"]);
  assert.deepEqual(codes(parcel, input({ rc: "missing" })), ["RC_REQUIRED_NOT_VERIFIED"]);
});

// ── PERSON RIDE + commercial (geo-configurable) ─────────────────────────
test("PERSON: commercial required by default → non-commercial blocked, commercial eligible", () => {
  const person = defaultPolicyForService("person_ride");
  assert.deepEqual(codes(person, input({ ownership: "non_commercial" })), ["COMMERCIAL_VEHICLE_REQUIRED"]);
  assert.equal(resolveRiderServiceEligibility(input({ ownership: "commercial" }), person).eligible, true);
});

test("PERSON: location override commercialRequired=false → non-commercial becomes eligible", () => {
  const person: ServiceEligibilityPolicy = {
    ...defaultPolicyForService("person_ride"),
    commercialRequired: false,
    resolvedGeo: { level: "pincode", refId: "PINCODE-132103" },
  };
  const d = resolveRiderServiceEligibility(input({ ownership: "non_commercial" }), person);
  assert.equal(d.eligible, true);
  assert.equal(d.resolvedGeo?.level, "pincode");
});

// ── EV: RC is NOT automatically exempt ──────────────────────────────────
test("EV without RC is only eligible when policy explicitly exempts RC (never auto)", () => {
  const evNoRc = input({ fuelKind: "ev", vehicleType: "ev_bike", rc: "missing", ownership: "commercial" });
  const strict = defaultPolicyForService("parcel"); // rc required
  assert.deepEqual(codes(strict, evNoRc), ["RC_REQUIRED_NOT_VERIFIED"]);
  const exempt: ServiceEligibilityPolicy = { ...strict, rcRequirement: "exempt" };
  assert.equal(resolveRiderServiceEligibility(evNoRc, exempt).eligible, true);
});

// ── Fuel + ownership allow-lists ────────────────────────────────────────
test("fuel allow-list blocks a disallowed fuel; empty list allows all", () => {
  const evOnly: ServiceEligibilityPolicy = { ...defaultPolicyForService("parcel"), allowedFuelKinds: ["ev"] };
  assert.deepEqual(codes(evOnly, input({ fuelKind: "petrol", ownership: "commercial" })), ["FUEL_NOT_ALLOWED"]);
  assert.equal(resolveRiderServiceEligibility(input({ fuelKind: "ev", ownership: "commercial" }), evOnly).eligible, true);
});

// ── Document validity vs verification ───────────────────────────────────
test("expired DL is distinct from missing and blocks a DL-required service", () => {
  const parcel = defaultPolicyForService("parcel");
  assert.deepEqual(codes(parcel, input({ dl: "expired", ownership: "commercial" })), ["DL_EXPIRED"]);
});

test("service disabled at geo blocks regardless of documents", () => {
  const off: ServiceEligibilityPolicy = { ...defaultPolicyForService("parcel"), serviceEnabled: false };
  assert.ok(codes(off, input({ ownership: "commercial" })).includes("SERVICE_DISABLED"));
});

// ── No vehicle ──────────────────────────────────────────────────────────
test("no vehicle → NO_VEHICLE block", () => {
  const parcel = defaultPolicyForService("parcel");
  assert.ok(codes(parcel, input({ vehicleClass: null })).includes("NO_VEHICLE"));
});

// ── Fuel normalisation ──────────────────────────────────────────────────
test("normalizeFuelKind buckets raw fuel labels", () => {
  assert.equal(normalizeFuelKind("electric"), "ev");
  assert.equal(normalizeFuelKind("EV"), "ev");
  assert.equal(normalizeFuelKind("ev_auto"), "ev");
  assert.equal(normalizeFuelKind("petrol"), "petrol");
  assert.equal(normalizeFuelKind("diesel"), "petrol");
  assert.equal(normalizeFuelKind("cng"), "cng");
  assert.equal(normalizeFuelKind(null), null);
});

// ── Exhaustive grid: every service × class × ownership × DL × RC ─────────
test("exhaustive grid produces a deterministic decision + reasons, no throws", () => {
  const services = ["food", "parcel", "person_ride"] as const;
  const classes: VehicleClass[] = ["2_wheeler", "3_wheeler", "4_wheeler"];
  const owners: OwnershipType[] = ["commercial", "non_commercial"];
  const docStates: DocState[] = ["verified", "missing", "expired", "pending", "failed"];
  let count = 0;
  for (const svc of services) {
    const policy = defaultPolicyForService(svc);
    for (const vc of classes) {
      for (const own of owners) {
        for (const dl of docStates) {
          for (const rc of docStates) {
            const d = resolveRiderServiceEligibility(
              input({ vehicleClass: vc, ownership: own, dl, rc }),
              policy
            );
            // eligible must be exactly the empty-blocking condition (deterministic).
            assert.equal(d.eligible, d.blocking.length === 0);
            // every blocking entry has a human reason.
            for (const b of d.blocking) assert.ok(b.reason.length > 0);
            count++;
          }
        }
      }
    }
  }
  assert.equal(count, 3 * 3 * 2 * 5 * 5);
});
