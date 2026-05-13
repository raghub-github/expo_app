import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getRoute, haversineDistanceKm } from "./distance.service.js";

describe("distance.service", () => {
  it("falls back to Haversine when no routing provider is configured", async () => {
    const origin = { lat: 12.9715987, lng: 77.594566 }; // Bengaluru
    const destination = { lat: 12.9351924, lng: 77.6244807 }; // nearby locality

    const route = await getRoute({ origin, destination, profile: "driving" });

    assert.strictEqual(route.source, "haversine");
    assert.strictEqual(route.approximate, true);
    assert.strictEqual(route.fromRoutingEngine, false);
    assert.ok(route.distanceKm > 0, "expected a positive distance");
    assert.ok(
      Math.abs(route.distanceKm - haversineDistanceKm(origin, destination)) < 0.2,
      `fallback distance ${route.distanceKm} should match Haversine approximation`
    );
  });
});
