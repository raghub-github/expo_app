import assert from "node:assert/strict";
import { test } from "node:test";
import { nearbyStoresToGeoJson, type NearbyStore } from "./nearby-stores.js";

function store(overrides: Partial<NearbyStore> = {}): NearbyStore {
  return { id: "s1", name: "Cafe", lat: 22.57, lng: 88.36, isOpen: true, distanceKm: 1.2, ...overrides };
}

test("nearbyStoresToGeoJson emits [lng,lat] point features with id/name/isOpen", () => {
  const fc = nearbyStoresToGeoJson([store({ id: "a", name: "A", lat: 22.5, lng: 88.3, isOpen: true })]);
  assert.equal(fc.type, "FeatureCollection");
  assert.equal(fc.features.length, 1);
  const f = fc.features[0]!;
  assert.equal(f.id, "a");
  assert.deepEqual(f.geometry.coordinates, [88.3, 22.5]); // lng,lat order for Mapbox
  assert.equal(f.properties.name, "A");
  assert.equal(f.properties.isOpen, true);
});

test("drops stores with non-finite coordinates", () => {
  const fc = nearbyStoresToGeoJson([
    store({ id: "ok" }),
    store({ id: "bad", lat: Number.NaN }),
    store({ id: "bad2", lng: Number.POSITIVE_INFINITY }),
  ]);
  assert.equal(fc.features.length, 1);
  assert.equal(fc.features[0]!.id, "ok");
});

test("empty input → empty FeatureCollection", () => {
  const fc = nearbyStoresToGeoJson([]);
  assert.equal(fc.features.length, 0);
});
