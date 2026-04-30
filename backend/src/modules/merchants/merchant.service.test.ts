import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { __test__enrichNearbyWithRoadDistance } from "./merchant.service.js";

describe("merchant.service distanceMode=road", () => {
  it("enriches nearby items with backend-computed road distance (haversine fallback when providers unset)", async () => {
    // No MAPBOX/OSRM configured in tests → distance.service falls back to haversine but still uses the same backend module.
    const userLat = 12.9715987;
    const userLng = 77.594566;
    const items = [
      {
        id: 1,
        store_id: "s1",
        store_name: "A",
        store_display_name: "A",
        store_description: null,
        banner_url: null,
        cuisine_types: null,
        city: null,
        latitude: 12.9351924,
        longitude: 77.6244807,
        operational_status: "OPEN",
        avg_preparation_time_minutes: null,
        is_active: true,
        is_available: true,
        is_accepting_orders: true,
        status: "ACTIVE",
        distance_km: 0,
      },
      {
        id: 2,
        store_id: "s2",
        store_name: "B",
        store_display_name: "B",
        store_description: null,
        banner_url: null,
        cuisine_types: null,
        city: null,
        latitude: 12.9611159,
        longitude: 77.6387999,
        operational_status: "OPEN",
        avg_preparation_time_minutes: null,
        is_active: true,
        is_available: true,
        is_accepting_orders: true,
        status: "ACTIVE",
        distance_km: 0,
      },
    ] as any;

    const out = await __test__enrichNearbyWithRoadDistance({ userLat, userLng, items });
    assert.strictEqual(out.length, 2);
    assert.ok(out[0].distance_km > 0);
    assert.ok(out[1].distance_km > 0);
    // Sorted by distance ascending.
    assert.ok(out[0].distance_km <= out[1].distance_km);
    // Rounded to 2 decimals.
    assert.strictEqual(Number(out[0].distance_km.toFixed(2)), out[0].distance_km);
  });
});

