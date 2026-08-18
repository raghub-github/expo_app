import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveRouteServiceability,
  maxRouteDistanceKmFor,
} from "./serviceability.ts";

const base = {
  hasStoreCoords: true,
  routeDistanceKm: 5,
  routeSource: "mapbox" as const,
  serviceRadiusKm: 8,
  multiplier: 1.5,
  maxRouteDistanceKm: null,
};

test("disabled → always serviceable (byte-identical to air-only model)", () => {
  assert.deepEqual(
    resolveRouteServiceability({ ...base, enabled: false, routeDistanceKm: 9999, routeSource: "haversine" }),
    { serviceable: true, reason: null }
  );
});

test("no store coords → skip route check even when enabled", () => {
  assert.deepEqual(
    resolveRouteServiceability({ ...base, enabled: true, hasStoreCoords: false, routeSource: "haversine" }),
    { serviceable: true, reason: null }
  );
});

test("enabled + route within radius*multiplier → serviceable", () => {
  // 8 * 1.5 = 12 km limit; 5 km route passes.
  assert.deepEqual(
    resolveRouteServiceability({ ...base, enabled: true }),
    { serviceable: true, reason: null }
  );
});

test("enabled + route beyond radius*multiplier → route_out_of_range", () => {
  // limit 12 km; 12.01 km fails (river/highway detour case).
  assert.deepEqual(
    resolveRouteServiceability({ ...base, enabled: true, routeDistanceKm: 12.01 }),
    { serviceable: false, reason: "route_out_of_range" }
  );
});

test("enabled + no real route (haversine fallback) → no_route", () => {
  assert.deepEqual(
    resolveRouteServiceability({ ...base, enabled: true, routeSource: "haversine" }),
    { serviceable: false, reason: "no_route" }
  );
});

test("absolute cap is the stricter limit", () => {
  // radius*multiplier = 12, but absolute cap 6 wins → 7 km fails.
  assert.equal(maxRouteDistanceKmFor(8, 1.5, 6), 6);
  assert.deepEqual(
    resolveRouteServiceability({ ...base, enabled: true, routeDistanceKm: 7, maxRouteDistanceKm: 6 }),
    { serviceable: false, reason: "route_out_of_range" }
  );
});

test("boundary: exactly at the limit is serviceable", () => {
  assert.deepEqual(
    resolveRouteServiceability({ ...base, enabled: true, routeDistanceKm: 12 }),
    { serviceable: true, reason: null }
  );
});
