import assert from "node:assert/strict";
import { test } from "node:test";
import { compareRouteByPolicy, optimizeForRideType } from "./route-policy.js";

/** Pick the winner (index 0 after sorting) among options for a given policy. */
function pick(
  options: { distanceKm: number; durationScaled: number }[],
  optimizeFor: "shortest_distance" | "fastest_time"
) {
  return [...options].sort((a, b) => compareRouteByPolicy(a, b, optimizeFor))[0];
}

// Two real alternatives: A is SHORTER but SLOWER, B is LONGER but FASTER — the classic
// "Mapbox picks the longer fast route" case.
const A = { distanceKm: 8, durationScaled: 20 }; // shorter, slower
const B = { distanceKm: 11, durationScaled: 15 }; // longer, faster

test("shortest_distance picks the shorter route even when it is slower", () => {
  assert.deepEqual(pick([A, B], "shortest_distance"), A);
  assert.deepEqual(pick([B, A], "shortest_distance"), A, "order-independent");
});

test("fastest_time picks the faster route even when it is longer", () => {
  assert.deepEqual(pick([A, B], "fastest_time"), B);
});

test("shortest_distance ties break toward the faster route", () => {
  const slow = { distanceKm: 5, durationScaled: 30 };
  const fast = { distanceKm: 5, durationScaled: 18 };
  assert.deepEqual(pick([slow, fast], "shortest_distance"), fast);
});

test("fastest_time ties break toward the shorter route", () => {
  const long = { distanceKm: 9, durationScaled: 12 };
  const short = { distanceKm: 6, durationScaled: 12 };
  assert.deepEqual(pick([long, short], "fastest_time"), short);
});

// The vehicle -> policy mapping must match the customer app (2W shortest, cars/autos fastest).
test("2-wheeler ride types optimise for shortest distance", () => {
  assert.equal(optimizeForRideType("bike"), "shortest_distance");
  assert.equal(optimizeForRideType("bike-lite"), "shortest_distance");
});

test("car / auto ride types optimise for fastest time", () => {
  for (const rt of ["auto", "ev_auto", "cab-economy", "cab-premium", "travel"]) {
    assert.equal(optimizeForRideType(rt), "fastest_time", rt);
  }
});
