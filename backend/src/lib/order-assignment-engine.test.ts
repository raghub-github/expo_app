import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  haversineDistanceMeters,
  isRiderWithinPickupRadiusMeters,
} from "./order-assignment-engine.js";

describe("order-assignment-engine pickup radius", () => {
  const pickup = { latitude: 12.9716, longitude: 77.5946 };

  it("includes rider at pickup point", () => {
    assert.equal(
      isRiderWithinPickupRadiusMeters(pickup.latitude, pickup.longitude, pickup, 3000),
      true
    );
  });

  it("includes rider exactly at configured radius (3000 m)", () => {
    const metersNorth = 3000;
    const latOffset = metersNorth / 111_320;
    const riderLat = pickup.latitude + latOffset;
    const distance = haversineDistanceMeters(riderLat, pickup.longitude, pickup.latitude, pickup.longitude);
    assert.ok(distance <= 3000, `expected <= 3000 m, got ${distance}`);
    assert.equal(
      isRiderWithinPickupRadiusMeters(riderLat, pickup.longitude, pickup, 3000),
      true
    );
  });

  it("excludes rider beyond configured radius", () => {
    let riderLat = pickup.latitude;
    while (
      haversineDistanceMeters(riderLat, pickup.longitude, pickup.latitude, pickup.longitude) <=
      3000
    ) {
      riderLat += 0.00001;
    }
    const distance = haversineDistanceMeters(
      riderLat,
      pickup.longitude,
      pickup.latitude,
      pickup.longitude
    );
    assert.ok(distance > 3000, `expected > 3000 m, got ${distance}`);
    assert.equal(
      isRiderWithinPickupRadiusMeters(riderLat, pickup.longitude, pickup, 3000),
      false
    );
  });

  it("rejects invalid pickup coordinates", () => {
    assert.equal(isRiderWithinPickupRadiusMeters(12.97, 77.59, { latitude: 0, longitude: 0 }, 3000), false);
  });

  it("rejects non-positive configured radius", () => {
    assert.equal(isRiderWithinPickupRadiusMeters(pickup.latitude, pickup.longitude, pickup, 0), false);
  });
});
