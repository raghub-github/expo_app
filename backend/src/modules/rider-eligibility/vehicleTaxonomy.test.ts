import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canAddVehicle,
  canonicalClassFromCashfreeRc,
  canonicalVehicleClass,
  normalizeRegistrationNumber,
  vehicleClassDisplayLabel,
} from "./vehicleTaxonomy.ts";

test("normalizeRegistrationNumber ignores case + separators", () => {
  assert.equal(normalizeRegistrationNumber("HR-01-AB-1234"), "HR01AB1234");
  assert.equal(normalizeRegistrationNumber("hr01ab1234"), "HR01AB1234");
  assert.equal(normalizeRegistrationNumber("  HR 01 AB 1234 "), "HR01AB1234");
  assert.equal(normalizeRegistrationNumber("WB34BL2723"), "WB34BL2723");
  assert.equal(normalizeRegistrationNumber("WB 34 BL 2723"), "WB34BL2723");
  assert.equal(normalizeRegistrationNumber(null), "");
});

test("canonicalClassFromCashfreeRc maps VAHAN class to 2W/3W/4W", () => {
  assert.equal(canonicalClassFromCashfreeRc({ vehicle_class: "MCWG" }), "2_wheeler");
  assert.equal(canonicalClassFromCashfreeRc({ class: "M-CYCLE/SCOOTER" }), "2_wheeler");
  assert.equal(canonicalClassFromCashfreeRc({ vehicle_class: "Auto Rickshaw" }), "3_wheeler");
  assert.equal(canonicalClassFromCashfreeRc({ vehicle_class: "3WN" }), "3_wheeler");
  assert.equal(canonicalClassFromCashfreeRc({ vehicle_class: "LMV" }), "4_wheeler");
  assert.equal(canonicalClassFromCashfreeRc({ vehicle_class: "Motor Car" }), "4_wheeler");
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
  assert.match(
    (sameClass as { reason: string }).reason,
    /You already have a 2 Wheeler registered/,
  );
});

test("canAddVehicle: 2W + 3W allowed; 3W + 3W rejected", () => {
  const existing = [{ registrationNumber: "WB34BL2723", vehicleCategory: "2_wheeler" }];
  assert.equal(
    canAddVehicle({
      existing,
      candidate: { registrationNumber: "WB12XX1234", vehicleCategory: "3_wheeler" },
    }).ok,
    true,
  );
  const same3 = canAddVehicle({
    existing: [{ registrationNumber: "WB12XX1234", vehicleCategory: "3_wheeler" }],
    candidate: { registrationNumber: "MH00AA0001", vehicleCategory: "3_wheeler" },
  });
  assert.equal(same3.ok, false);
  assert.equal((same3 as { code: string }).code, "SAME_VEHICLE_CLASS");
});

test("canAddVehicle: duplicate RC (any formatting) rejected", () => {
  const existing = [{ registrationNumber: "HR-01-AB-1234", vehicleCategory: "2_wheeler" }];
  const dup = canAddVehicle({
    existing,
    candidate: { registrationNumber: "hr01ab1234", vehicleCategory: "4_wheeler" },
  });
  assert.equal(dup.ok, false);
  assert.equal((dup as { code: string }).code, "DUPLICATE_RC");
  const spaced = canAddVehicle({
    existing: [{ registrationNumber: "WB34BL2723", vehicleCategory: "2_wheeler" }],
    candidate: { registrationNumber: "WB 34 BL 2723", vehicleCategory: "4_wheeler" },
  });
  assert.equal(spaced.ok, false);
  assert.equal((spaced as { code: string }).code, "DUPLICATE_RC");
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

test("vehicleClassDisplayLabel", () => {
  assert.equal(vehicleClassDisplayLabel("2_wheeler"), "2 Wheeler");
  assert.equal(canonicalVehicleClass({ vehicleCategory: "2_wheeler", vehicleType: "bike" }), "2_wheeler");
});
