/**
 * Consolidated MULTI-VEHICLE + GEO test matrix (§50, §51, §52) — completes the program's
 * test coverage. Multi-vehicle garage sequences (add / duplicate / same-class / third /
 * retire-then-add) use the canonical taxonomy; per-vehicle × location-policy cases use the
 * engine with a resolved policy (representing which geo node's rule won after inheritance).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { canAddVehicle, type VehicleForTaxonomy } from "./vehicleTaxonomy.ts";
import {
  resolveRiderServiceEligibility,
  type EligibilityService,
  type ServiceEligibilityPolicy,
  type RiderEligibilityInput,
} from "./eligibilityEngine.ts";
import { defaultPolicyForService, normalizeFuelKind } from "./serviceEligibilityDefaults.ts";
import { ownershipFromVehicle, vehicleClassFromCategory } from "./riderEligibilityInputs.ts";

const BIKE: VehicleForTaxonomy = { registrationNumber: "HR01AB1234", vehicleCategory: "2_wheeler", vehicleType: "bike" };
const SCOOTER: VehicleForTaxonomy = { registrationNumber: "HR02CD5678", vehicleCategory: "2_wheeler", vehicleType: "scooter" };
const CAR: VehicleForTaxonomy = { registrationNumber: "DL05C7777", vehicleCategory: "4_wheeler", vehicleType: "car" };
const AUTO: VehicleForTaxonomy = { registrationNumber: "MH12ZZ9999", vehicleCategory: "3_wheeler", vehicleType: "auto" };

/* ── §50: a rider's garage grows through the allowed/blocked sequences ───────────────── */

test("§50 MATRIX: bike → (same-class ✕) → (duplicate ✕) → car ✓ → (third ✕) → retire → 2W again ✓", () => {
  const garage: VehicleForTaxonomy[] = [];

  // 1. First vehicle (bike) — always allowed.
  assert.deepEqual(canAddVehicle({ existing: garage, candidate: BIKE }), { ok: true });
  garage.push(BIKE);

  // 2. Second 2-wheeler (scooter) — rejected, same canonical class (§3/§32).
  const same = canAddVehicle({ existing: garage, candidate: SCOOTER });
  assert.equal(same.ok, false);
  assert.equal((same as { code: string }).code, "SAME_VEHICLE_CLASS");

  // 3. Duplicate RC (car body, bike's plate reformatted) — rejected (§15).
  const dup = canAddVehicle({ existing: garage, candidate: { ...CAR, registrationNumber: "hr-01-ab-1234" } });
  assert.equal(dup.ok, false);
  assert.equal((dup as { code: string }).code, "DUPLICATE_RC");

  // 4. Car (different class) — allowed → garage now bike + car.
  assert.deepEqual(canAddVehicle({ existing: garage, candidate: CAR }), { ok: true });
  garage.push(CAR);

  // 5. Third vehicle (auto) — rejected, max 2 (§31).
  const third = canAddVehicle({ existing: garage, candidate: AUTO });
  assert.equal(third.ok, false);
  assert.equal((third as { code: string }).code, "MAX_VEHICLES");

  // 6. Retire the bike → a 2-wheeler may be added again.
  const afterRetire = garage.filter((v) => v !== BIKE);
  assert.deepEqual(canAddVehicle({ existing: afterRetire, candidate: SCOOTER }), { ok: true });
});

/* ── §51 / §52: per-vehicle attributes × resolved location policy ───────────────────── */

function input(v: VehicleForTaxonomy & { fuel?: string; commercial?: boolean }, dl = "verified", rc = "verified"): RiderEligibilityInput {
  return {
    vehicleClass: vehicleClassFromCategory(v.vehicleCategory ?? null, v.vehicleType ?? null),
    vehicleType: v.vehicleType ?? null,
    fuelKind: normalizeFuelKind(v.fuel ?? "petrol"),
    ownership: ownershipFromVehicle(v.commercial ?? false),
    dl: dl as RiderEligibilityInput["dl"],
    rc: rc as RiderEligibilityInput["rc"],
  };
}
function policy(service: EligibilityService, over: Partial<ServiceEligibilityPolicy> = {}): ServiceEligibilityPolicy {
  return { ...defaultPolicyForService(service), ...over };
}
const codes = (d: { blocking: { code: string }[] }) => d.blocking.map((b) => b.code);

test("§51 MATRIX: bike active → food+parcel; car active → parcel+ride (per-vehicle differs)", () => {
  // Bike (2W, non-commercial, DL+RC verified): food ✓, parcel ✓, ride ✕ (commercial required by default).
  const bike = input(BIKE);
  assert.equal(resolveRiderServiceEligibility(bike, policy("food")).eligible, true);
  assert.equal(resolveRiderServiceEligibility(bike, policy("parcel")).eligible, true);
  assert.equal(resolveRiderServiceEligibility(bike, policy("person_ride")).eligible, false);

  // Car (4W, COMMERCIAL, DL+RC verified): food ✕ (2W-only), parcel ✓, ride ✓.
  const car = input({ ...CAR, commercial: true });
  assert.equal(resolveRiderServiceEligibility(car, policy("food")).eligible, false);
  assert.equal(resolveRiderServiceEligibility(car, policy("parcel")).eligible, true);
  assert.equal(resolveRiderServiceEligibility(car, policy("person_ride")).eligible, true);
});

test("§52 MATRIX: same rider+vehicle, Person Ride flips by location (state requires commercial, pincode overrides false)", () => {
  const carNonCommercial = input({ ...CAR, commercial: false });
  // State rule: commercial required → non-commercial car NOT eligible.
  const stateRule = policy("person_ride", { commercialRequired: true, resolvedGeo: { level: "state", refId: "s1" } });
  const atState = resolveRiderServiceEligibility(carNonCommercial, stateRule);
  assert.equal(atState.eligible, false);
  assert.ok(codes(atState).includes("COMMERCIAL_VEHICLE_REQUIRED"));

  // Pincode override (nearest wins): commercial NOT required → same car now eligible.
  const pincodeRule = policy("person_ride", { commercialRequired: false, resolvedGeo: { level: "pincode", refId: "p1" } });
  const atPincode = resolveRiderServiceEligibility(carNonCommercial, pincodeRule);
  assert.equal(atPincode.eligible, true);
});

test("§53 MATRIX: DL expiry blocks only DL-required services (food DL-optional stays open)", () => {
  // Expired DL, 2W: food (DL optional) stays eligible; parcel (DL required) blocked.
  const bikeExpiredDl = input(BIKE, "expired", "verified");
  assert.equal(resolveRiderServiceEligibility(bikeExpiredDl, policy("food")).eligible, true);
  const parcel = resolveRiderServiceEligibility(bikeExpiredDl, policy("parcel"));
  assert.equal(parcel.eligible, false);
  assert.ok(codes(parcel).includes("DL_EXPIRED"));
});
