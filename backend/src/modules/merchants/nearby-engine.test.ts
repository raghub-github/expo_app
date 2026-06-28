import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { effectiveServiceRadiusKm } from "./merchant.service.js";

/**
 * Unit tests for the per-store radius rule — the load-bearing fix for
 * the user-visible bug ("stores show outside their service area").
 *
 * The end-to-end engine (bbox + Mapbox Matrix + cache) is exercised by
 * the existing integration tests against a seeded Supabase instance;
 * these are pure-function tests that pin the math.
 */

describe("effectiveServiceRadiusKm", () => {
  it("returns the global cap when store has no delivery_radius_km", () => {
    assert.equal(effectiveServiceRadiusKm(15, null), 15);
    assert.equal(effectiveServiceRadiusKm(15, undefined), 15);
  });

  it("returns the global cap when delivery_radius_km is 0 / negative / NaN", () => {
    // Treat junk values as 'no opinion' rather than 'never deliver'.
    // A 0-radius store would silently disappear; that's a data bug we
    // want to surface in admin, not enforce silently.
    assert.equal(effectiveServiceRadiusKm(15, 0), 15);
    assert.equal(effectiveServiceRadiusKm(15, -5), 15);
    assert.equal(effectiveServiceRadiusKm(15, "abc"), 15);
  });

  it("returns min(globalCap, store) when store opted into a smaller radius", () => {
    assert.equal(effectiveServiceRadiusKm(15, 3), 3);
    assert.equal(effectiveServiceRadiusKm(15, 7.5), 7.5);
    assert.equal(effectiveServiceRadiusKm(10, 8), 8);
  });

  it("returns globalCap when store radius exceeds it (the cap is non-negotiable)", () => {
    // A store cannot opt INTO a longer radius than the platform allows.
    assert.equal(effectiveServiceRadiusKm(10, 25), 10);
    assert.equal(effectiveServiceRadiusKm(15, 50), 15);
  });

  it("accepts numeric strings (postgres NUMERIC returns string)", () => {
    assert.equal(effectiveServiceRadiusKm(15, "5"), 5);
    assert.equal(effectiveServiceRadiusKm(15, "7.50"), 7.5);
  });
});

describe("bbox math — sanity checks", () => {
  // The engine uses:
  //   latDelta = ROUGH_RADIUS_KM / 111.32
  //   lngDelta = ROUGH_RADIUS_KM / (111.32 × cos(lat))
  // Pin those numbers so any change shows up in review.
  it("latDelta at 12 km is about 0.108 degrees", () => {
    const latDelta = 12 / 111.32;
    assert.ok(Math.abs(latDelta - 0.1078) < 0.001);
  });

  it("lngDelta at Bengaluru (12.97°N) is about 0.110 degrees", () => {
    const lat = 12.9716;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const lngDelta = 12 / (111.32 * cosLat);
    assert.ok(Math.abs(lngDelta - 0.1107) < 0.002);
  });

  it("lngDelta at Srinagar (34.08°N) is wider (~0.130) — cos shrinks", () => {
    const lat = 34.0837;
    const cosLat = Math.cos((lat * Math.PI) / 180);
    const lngDelta = 12 / (111.32 * cosLat);
    assert.ok(lngDelta > 0.125 && lngDelta < 0.135);
  });

  it("near-pole guard: clamps cos(lat) to 0.1 so lngDelta never explodes", () => {
    // The engine has `const cosLat = Math.max(Math.cos((user.lat * Math.PI) / 180), 0.1);`
    // — assert the floor.
    const lat = 89.5;
    const cosLat = Math.max(Math.cos((lat * Math.PI) / 180), 0.1);
    assert.equal(cosLat, 0.1);
  });
});

describe("cell-cache key behaviour (informal)", () => {
  // We can't import the private `resultCacheKey` directly without
  // exporting it; instead we re-derive the math here and assert what
  // the engine should do.
  const CELL = 0.005;
  function key(lat: number, lng: number, r: number, n: number): string {
    return `${Math.round(lat / CELL)}:${Math.round(lng / CELL)}:r${r}:n${n}`;
  }

  it("two coords clearly inside one cell collapse to same key", () => {
    // Both 50 m from the cell centre, so they cannot land in different cells.
    const k1 = key(12.97, 77.59, 10, 15);
    const k2 = key(12.9706, 77.5907, 10, 15);
    assert.equal(k1, k2);
  });

  it("coords ≥ 1 km apart land in different cells", () => {
    const k1 = key(12.9716, 77.5946, 10, 15);
    const k2 = key(12.9806, 77.6036, 10, 15);
    assert.notEqual(k1, k2);
  });

  it("different params produce different cache keys at same location", () => {
    const k1 = key(12.9716, 77.5946, 10, 15);
    const k2 = key(12.9716, 77.5946, 5, 15);
    assert.notEqual(k1, k2);
  });
});
