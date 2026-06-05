import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeRiderDistanceSnapshot } from "./rider-order-distance-snapshot.js";

describe("computeRiderDistanceSnapshot", () => {
  it("computes Mx and Cx in km from rider GPS", () => {
    // Rider near Connaught Place, Delhi; merchant ~1km north; customer ~3km south
    const snap = computeRiderDistanceSnapshot(28.6315, 77.2167, {
      pickupLat: 28.6405,
      pickupLng: 77.2167,
      dropLat: 28.602,
      dropLng: 77.2167,
    });

    assert.ok(snap.merchantDistanceKm != null && snap.merchantDistanceKm > 0);
    assert.ok(snap.customerDistanceKm != null && snap.customerDistanceKm > 0);
    assert.ok(snap.merchantDistanceKm! < snap.customerDistanceKm!);
    assert.equal(snap.riderLat, 28.6315);
    assert.equal(snap.riderLng, 77.2167);
  });
});
