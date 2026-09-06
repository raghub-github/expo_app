import assert from "node:assert/strict";
import { test } from "node:test";
import {
  dominantStatus,
  dominantService,
  hotZonesToGeoJson,
  hotZonesToDisplayList,
  hotZonesToPanelZones,
  type HotZoneCell,
} from "./hot-zones.js";

function cell(overrides: Partial<HotZoneCell> = {}): HotZoneCell {
  return {
    h3Index: "883cf2c647fffff",
    resolution: 8,
    center: { lat: 22.57, lng: 88.36 },
    boundary: [
      [88.36, 22.57],
      [88.361, 22.571],
      [88.362, 22.57],
      [88.362, 22.569],
      [88.361, 22.568],
      [88.36, 22.569],
    ],
    services: [{ service: "food", status: "HOT", demandScore: 10, supplyScore: 2, pressure: 5 }],
    calculatedAt: new Date().toISOString(),
    validUntil: new Date(Date.now() + 120000).toISOString(),
    ...overrides,
  };
}

test("dominantStatus picks the highest-severity service", () => {
  const c = cell({
    services: [
      { service: "food", status: "WARM", demandScore: 5, supplyScore: 3, pressure: 1.2 },
      { service: "parcel", status: "CRITICAL", demandScore: 20, supplyScore: 1, pressure: 20 },
      { service: "person_ride", status: "NORMAL", demandScore: 0, supplyScore: 5, pressure: 0 },
    ],
  });
  assert.equal(dominantStatus(c), "CRITICAL");
});

test("hotZonesToGeoJson emits closed hexagon polygons with status/service props", () => {
  const fc = hotZonesToGeoJson([
    cell({
      services: [
        { service: "food", status: "HOT", demandScore: 10, supplyScore: 2, pressure: 5 },
        { service: "parcel", status: "WARM", demandScore: 4, supplyScore: 3, pressure: 1.3 },
      ],
    }),
  ]);
  assert.equal(fc.features.length, 1);
  const f = fc.features[0]!;
  assert.equal(f.geometry.type, "Polygon");
  const ring = f.geometry.coordinates[0]!;
  // ring is closed (first === last) and has the 6 hex verts + the closing point
  assert.deepEqual(ring[0], ring[ring.length - 1]);
  assert.equal(ring.length, 7);
  assert.equal(f.properties.status, "HOT"); // dominant of HOT/WARM
  assert.equal(f.properties.services, "food,parcel");
  assert.equal(f.properties.serviceCount, 2);
});

test("hotZonesToGeoJson synthesizes a hex when boundary is missing or degenerate", () => {
  const fc = hotZonesToGeoJson([cell({ boundary: [[88.36, 22.57]] })]);
  assert.equal(fc.features.length, 1);
  const ring = fc.features[0]!.geometry.coordinates[0]!;
  assert.equal(ring.length, 7);
  assert.deepEqual(ring[0], ring[ring.length - 1]);
});

test("display list sorts by status severity then distance", () => {
  const near = cell({ h3Index: "a", center: { lat: 22.571, lng: 88.361 }, services: [{ service: "food", status: "WARM", demandScore: 4, supplyScore: 3, pressure: 1.3 }] });
  const farCritical = cell({ h3Index: "b", center: { lat: 22.60, lng: 88.40 }, services: [{ service: "food", status: "CRITICAL", demandScore: 30, supplyScore: 1, pressure: 30 }] });
  const list = hotZonesToDisplayList([near, farCritical], { lat: 22.57, lng: 88.36 });
  assert.equal(list[0]!.id, "b"); // CRITICAL first despite being farther
  assert.equal(list[1]!.id, "a");
  assert.ok(list[1]!.distanceKm >= 0);
});

test("panel zones carry status + service mix in the label, storeCount 0", () => {
  const multi = cell({
    h3Index: "z",
    services: [
      { service: "food", status: "HOT", demandScore: 10, supplyScore: 2, pressure: 5 },
      { service: "person_ride", status: "WARM", demandScore: 4, supplyScore: 3, pressure: 1.3 },
    ],
  });
  const [row] = hotZonesToPanelZones([multi], { lat: 22.57, lng: 88.36 });
  assert.equal(row!.id, "z");
  assert.equal(row!.storeCount, 0); // never a restaurant count — these are demand zones
  assert.match(row!.label, /Hot/); // dominant status word
  assert.match(row!.label, /Food/);
  assert.match(row!.label, /Ride/);
});

test("dominantService = highest-severity service (drives fill colour); geojson emits it", () => {
  const cell2 = cell({
    h3Index: "svc",
    services: [
      { service: "food", status: "WARM", demandScore: 4, supplyScore: 3, pressure: 1.3 },
      { service: "person_ride", status: "HOT", demandScore: 10, supplyScore: 2, pressure: 5 },
    ],
  });
  assert.equal(dominantService(cell2), "person_ride");
  const fc = hotZonesToGeoJson([cell2]);
  assert.equal(fc.features[0]!.properties.service, "person_ride");
  assert.equal(fc.features[0]!.properties.services, "food,person_ride");
});

test("panel zones sort strongest-first (same order as the display list)", () => {
  const warm = cell({ h3Index: "w", center: { lat: 22.571, lng: 88.361 }, services: [{ service: "food", status: "WARM", demandScore: 4, supplyScore: 3, pressure: 1.3 }] });
  const critical = cell({ h3Index: "c", center: { lat: 22.60, lng: 88.40 }, services: [{ service: "parcel", status: "CRITICAL", demandScore: 30, supplyScore: 1, pressure: 30 }] });
  const rows = hotZonesToPanelZones([warm, critical], { lat: 22.57, lng: 88.36 });
  assert.equal(rows[0]!.id, "c");
  assert.equal(rows[1]!.id, "w");
});
