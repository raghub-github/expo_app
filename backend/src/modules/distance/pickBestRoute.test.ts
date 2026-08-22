import assert from "node:assert/strict";
import { test } from "node:test";
import { pickBestRoute } from "./distance.service.js";

const G = "abc"; // any non-empty geometry so the route is considered valid

test("driving: picks the SHORTEST-distance alternative, not the fastest", () => {
  // Alt A is 200m shorter but 100s slower; Mapbox's default (fastest) would return B.
  const a = { distance: 1000, duration: 600, geometry: G };
  const b = { distance: 1200, duration: 500, geometry: G };
  const best = pickBestRoute([b, a], "driving");
  assert.equal(best?.distance, 1000, "should report the shorter distance");
  assert.equal(best?.geometry, G);
});

test("bike: still picks the shortest distance (unchanged behaviour)", () => {
  const a = { distance: 800, duration: 400, geometry: G };
  const b = { distance: 900, duration: 300, geometry: G };
  const best = pickBestRoute([b, a], "bike");
  assert.equal(best?.distance, 800);
});

test("ties on distance break toward the faster route", () => {
  const slow = { distance: 1000, duration: 700, geometry: G };
  const fast = { distance: 1000, duration: 500, geometry: G };
  const best = pickBestRoute([slow, fast], "driving");
  assert.equal(best?.distance, 1000);
  // duration is the faster of the two equal-distance routes
  assert.equal(best?.duration, 500);
});

test("routes without a geometry are ignored (need a real drawable route)", () => {
  const noGeo = { distance: 500, duration: 300 };
  const withGeo = { distance: 900, duration: 400, geometry: G };
  const best = pickBestRoute([noGeo, withGeo], "driving");
  assert.equal(best?.distance, 900);
});

test("empty / all-invalid input returns null", () => {
  assert.equal(pickBestRoute([], "driving"), null);
  assert.equal(pickBestRoute([{ distance: 1 }, { duration: 1 }], "driving"), null);
});
