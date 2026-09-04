import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAddVehicle,
  canonicalVehicleClass,
  normalizeRegistrationNumber,
} from "./vehicleTaxonomy.ts";

test("normalizeRegistrationNumber ignores case + separators", () => {
  assert.equal(normalizeRegistrationNumber("HR-01-AB-1234"), "HR01AB1234");
  assert.equal(normalizeRegistrationNumber("hr01ab1234"), "HR01AB1234");
  assert.equal(normalizeRegistrationNumber("  HR 01 AB 1234 "), "HR01AB1234");
  assert.equal(normalizeRegistrationNumber(null), "");
});

test("canonicalVehicleClass maps category/type to 2W/3W/4W", () => {
  assert.equal(canonicalVehicleClass({ vehicleCategory: "2_wheeler", vehicleType: "bike" }), "2_wheeler");
  assert.equal(canonicalVehicleClass({ vehicleCategory: "3_wheeler", vehicleType: "auto" }), "3_wheeler");
  assert.equal(canonicalVehicleClass({ vehicleCategory: "4_wheeler", vehicleType: "car" }), "4_wheeler");
});

test("canAddVehicle: first vehicle is always allowed", () => {
  assert.deepEqual(
    canAddVehicle({ existing: [], candidate: { registrationNumber: "HR01AB1234", vehicleCategory: "2_wheeler" } }),
    { ok: true }
  );
});

test("canAddVehicle: bike + car allowed; bike + bike rejected (same class)", () => {
  const existing = [{ registrationNumber: "HR01AB1234", vehicleCategory: "2_wheeler", vehicleType: "bike" }];
  assert.deepEqual(
    canAddVehicle({ existing, candidate: { registrationNumber: "DL05C7777", vehicleCategory: "4_wheeler", vehicleType: "car" } }),
    { ok: true }
  );
  const sameClass = canAddVehicle({
    existing,
    candidate: { registrationNumber: "MH12ZZ9999", vehicleCategory: "2_wheeler", vehicleType: "scooter" },
  });
  assert.equal(sameClass.ok, false);
  assert.equal((sameClass as { code: string }).code, "SAME_VEHICLE_CLASS");
});

test("canAddVehicle: duplicate RC (any formatting) rejected", () => {
  const existing = [{ registrationNumber: "HR-01-AB-1234", vehicleCategory: "2_wheeler" }];
  const dup = canAddVehicle({
    existing,
    candidate: { registrationNumber: "hr01ab1234", vehicleCategory: "4_wheeler" },
  });
  assert.equal(dup.ok, false);
  assert.equal((dup as { code: string }).code, "DUPLICATE_RC");
});

test("canAddVehicle: third vehicle rejected (max 2)", () => {
  const existing = [
    { registrationNumber: "HR01AB1234", vehicleCategory: "2_wheeler" },
    { registrationNumber: "DL05C7777", vehicleCategory: "4_wheeler" },
  ];
  const third = canAddVehicle({
    existing,
    candidate: { registrationNumber: "MH12ZZ9999", vehicleCategory: "3_wheeler" },
  });
  assert.equal(third.ok, false);
  assert.equal((third as { code: string }).code, "MAX_VEHICLES");
});

test("canAddVehicle: blank registration rejected", () => {
  const r = canAddVehicle({ existing: [], candidate: { registrationNumber: "  ", vehicleCategory: "2_wheeler" } });
  assert.equal(r.ok, false);
  assert.equal((r as { code: string }).code, "INVALID_REGISTRATION");
});
