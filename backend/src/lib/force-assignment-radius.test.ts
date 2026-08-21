import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ADMIN_SELECTABLE_MAX_RADIUS_KM,
  resolveForceAssignmentRadiusMeters,
} from "./force-assignment-radius.js";
import {
  haversineDistanceMeters,
  isRiderWithinPickupRadiusMeters,
} from "./order-assignment-engine.js";
import { canAdvanceDispatchWave } from "./order-dispatch-settings.js";

describe("Force Assignment radius (never Wave-1)", () => {
  const pickup = { latitude: 12.9716, longitude: 77.5946 };

  it("defaults missing radiusKm to admin max 10 km (meters)", () => {
    assert.equal(resolveForceAssignmentRadiusMeters(null), 10_000);
    assert.equal(resolveForceAssignmentRadiusMeters(undefined), 10_000);
    assert.equal(ADMIN_SELECTABLE_MAX_RADIUS_KM, 10);
  });

  it("Test 1 — admin 10 km, rider ~7 km → eligible", () => {
    const forceRadiusM = resolveForceAssignmentRadiusMeters(10);
    assert.equal(forceRadiusM, 10_000);
    // ~7 km north of pickup
    const riderLat = pickup.latitude + 7000 / 111_320;
    const dist = haversineDistanceMeters(
      riderLat,
      pickup.longitude,
      pickup.latitude,
      pickup.longitude
    );
    assert.ok(dist > 6500 && dist < 7500, `expected ~7km, got ${dist}`);
    assert.equal(
      isRiderWithinPickupRadiusMeters(riderLat, pickup.longitude, pickup, forceRadiusM),
      true
    );
    // Wave-1 style 3.72 km would reject this rider — force must not use that.
    assert.equal(
      isRiderWithinPickupRadiusMeters(riderLat, pickup.longitude, pickup, 3720),
      false
    );
  });

  it("Test 2 — admin 10 km, rider ~11 km → not eligible", () => {
    const forceRadiusM = resolveForceAssignmentRadiusMeters(10);
    const riderLat = pickup.latitude + 11_000 / 111_320;
    const dist = haversineDistanceMeters(
      riderLat,
      pickup.longitude,
      pickup.latitude,
      pickup.longitude
    );
    assert.ok(dist > 10_500, `expected >10.5km, got ${dist}`);
    assert.equal(
      isRiderWithinPickupRadiusMeters(riderLat, pickup.longitude, pickup, forceRadiusM),
      false
    );
  });

  it("Test 10 — force 10 km accepts rider outside Wave-1 3.72 km", () => {
    const wave1RadiusM = 3720;
    const forceRadiusM = resolveForceAssignmentRadiusMeters(10);
    const riderLat = pickup.latitude + 7800 / 111_320;
    assert.equal(
      isRiderWithinPickupRadiusMeters(riderLat, pickup.longitude, pickup, wave1RadiusM),
      false
    );
    assert.equal(
      isRiderWithinPickupRadiusMeters(riderLat, pickup.longitude, pickup, forceRadiusM),
      true
    );
  });

  it("clamps radiusKm to [0.5, 10]", () => {
    assert.equal(resolveForceAssignmentRadiusMeters(0.1), 500);
    assert.equal(resolveForceAssignmentRadiusMeters(25), 10_000);
    assert.equal(resolveForceAssignmentRadiusMeters(5), 5000);
  });
});

describe("Dispatch wave advance gate (Wave 2/3)", () => {
  it("Test 3/5 — next wave allowed when configured even if radius not larger", () => {
    // Primary bug: Wave-1 pickup 5000m capped == Wave-2 expansion 5000m → old gate blocked.
    assert.equal(
      canAdvanceDispatchWave({
        enabled: true,
        maxWaves: 3,
        currentWave: 1,
        nextRadiusMeters: 5000,
      }),
      true
    );
    assert.equal(
      canAdvanceDispatchWave({
        enabled: true,
        maxWaves: 3,
        currentWave: 2,
        nextRadiusMeters: 8000,
      }),
      true
    );
  });

  it("Test 7 — no advance past maxWaves (exhausted)", () => {
    assert.equal(
      canAdvanceDispatchWave({
        enabled: true,
        maxWaves: 3,
        currentWave: 3,
        nextRadiusMeters: 10_000,
      }),
      false
    );
  });

  it("blocks when waves disabled or expansion missing", () => {
    assert.equal(
      canAdvanceDispatchWave({
        enabled: false,
        maxWaves: 3,
        currentWave: 1,
        nextRadiusMeters: 5000,
      }),
      false
    );
    assert.equal(
      canAdvanceDispatchWave({
        enabled: true,
        maxWaves: 3,
        currentWave: 1,
        nextRadiusMeters: null,
      }),
      false
    );
  });
});
