import assert from "node:assert/strict";
import { test } from "node:test";
import { latLngToCell } from "h3-js";
import { filterZonesWithinRadius, type HotZoneStateReadRow } from "./hot-zone.service.js";

// Metres per degree of latitude for the earth radius the service's haversine uses
// (R = 6371008.8 m). Placing a zone due north by this × D degrees puts its centre exactly
// D metres from the rider, so the 20km boundary can be probed precisely.
const M_PER_DEG_LAT = (6371008.8 * Math.PI) / 180; // ≈ 111194.93

function rowAtNorth(
  rider: { lat: number; lng: number },
  distanceMeters: number,
  service: "food" | "parcel" | "person_ride" = "food",
  status = "HOT"
): HotZoneStateReadRow {
  const centerLat = rider.lat + distanceMeters / M_PER_DEG_LAT;
  const centerLng = rider.lng;
  return {
    h3_index: latLngToCell(centerLat, centerLng, 8), // real, valid index (for boundary)
    resolution: 8,
    service_type: service,
    status,
    center_lat: centerLat,
    center_lng: centerLng,
    weighted_demand: 6,
    effective_supply: 2,
    pressure: 3,
    computed_at: new Date().toISOString(),
    valid_until: new Date(Date.now() + 120_000).toISOString(),
  };
}

const RADIUS = 20_000; // 20km

test("every rider sees zones within 20km and nothing beyond it", () => {
  const rider = { lat: 19.0, lng: 73.0 };
  const rows = [
    rowAtNorth(rider, 0),
    rowAtNorth(rider, 5_000),
    rowAtNorth(rider, 15_000),
    rowAtNorth(rider, 19_500),
    rowAtNorth(rider, 20_500), // just outside
    rowAtNorth(rider, 25_000),
    rowAtNorth(rider, 50_000),
  ];
  const zones = filterZonesWithinRadius(rows, rider.lat, rider.lng, RADIUS);
  const dists = zones.map((z) => Math.round((z.center.lat - rider.lat) * M_PER_DEG_LAT));
  assert.equal(zones.length, 4, "only the 4 zones within 20km are returned");
  assert.deepEqual(dists.sort((a, b) => a - b), [0, 5000, 15000, 19500]);
});

test("boundary: a zone exactly at 20km is included; just past it is excluded", () => {
  const rider = { lat: 12.9, lng: 77.6 };
  const inAt = filterZonesWithinRadius([rowAtNorth(rider, 20_000)], rider.lat, rider.lng, RADIUS);
  const outAt = filterZonesWithinRadius([rowAtNorth(rider, 20_001)], rider.lat, rider.lng, RADIUS);
  assert.equal(inAt.length, 1, "exactly 20km is within the radius");
  assert.equal(outAt.length, 0, "1m past 20km is excluded");
});

test("per-rider: the SAME global zones filter to each rider's own 20km circle", () => {
  // Two riders 40km apart (north/south). A zone sits between them, ~19km from each.
  const south = { lat: 19.0, lng: 73.0 };
  const north = { lat: south.lat + 38_000 / M_PER_DEG_LAT, lng: 73.0 };
  const middle = rowAtNorth(south, 19_000); // 19km from south, ~19km from north
  const nearNorthOnly = rowAtNorth(north, 3_000); // 3km from north, ~41km from south

  const global = [middle, nearNorthOnly];
  const seenBySouth = filterZonesWithinRadius(global, south.lat, south.lng, RADIUS);
  const seenByNorth = filterZonesWithinRadius(global, north.lat, north.lng, RADIUS);

  assert.deepEqual(seenBySouth.map((z) => z.h3Index), [middle.h3_index], "south sees only the middle zone");
  assert.equal(seenByNorth.length, 2, "north sees both the middle zone and the near one");
});

test("a wider configured radius lets a rider see farther zones", () => {
  const rider = { lat: 28.6, lng: 77.2 };
  const far = [rowAtNorth(rider, 35_000)];
  assert.equal(filterZonesWithinRadius(far, rider.lat, rider.lng, 20_000).length, 0);
  assert.equal(filterZonesWithinRadius(far, rider.lat, rider.lng, 40_000).length, 1);
});

test("rows at the same cell collapse into one zone carrying both services", () => {
  const rider = { lat: 19.0, lng: 73.0 };
  const a = rowAtNorth(rider, 5_000, "food");
  const b: HotZoneStateReadRow = { ...a, service_type: "person_ride", status: "WARM" };
  const zones = filterZonesWithinRadius([a, b], rider.lat, rider.lng, RADIUS);
  assert.equal(zones.length, 1);
  assert.equal(zones[0]!.services.length, 2);
  assert.deepEqual(zones[0]!.services.map((s) => s.service).sort(), ["food", "person_ride"]);
});
