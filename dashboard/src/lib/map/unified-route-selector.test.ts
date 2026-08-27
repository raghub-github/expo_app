/**
 * Node test for Live Rider Map route selector (no vitest in dashboard package scripts).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  selectShortestPracticalRoute,
  type MapboxRouteCandidate,
} from "./unified-route-selector";

function route(
  distance: number,
  duration: number,
  coords: [number, number][] = [
    [76.98, 29.34],
    [76.96, 29.37],
  ]
): MapboxRouteCandidate {
  return {
    distance,
    duration,
    geometry: { type: "LineString", coordinates: coords },
  };
}

describe("selectShortestPracticalRoute", () => {
  it("picks shortest distance among alternatives", () => {
    const selected = selectShortestPracticalRoute(
      [route(9800, 900), route(7100, 1100), route(7400, 950)],
      "shortest_distance",
      "driving"
    );
    assert.equal(selected?.distanceMeters, 7100);
    assert.equal(selected?.routeIndex, 1);
    assert.equal(selected?.diagnostic.anomaly, false);
  });

  it("keeps Mapbox primary when it is already the shortest (GMF100008 case)", () => {
    const selected = selectShortestPracticalRoute(
      [route(7413, 1006), route(8301, 1318)],
      "shortest_distance"
    );
    assert.equal(selected?.distanceMeters, 7413);
    assert.equal(selected?.routeIndex, 0);
  });

  it("applies detour guard for fastest_time", () => {
    const selected = selectShortestPracticalRoute(
      [route(11500, 800), route(7100, 1000)],
      "fastest_time"
    );
    assert.equal(selected?.distanceMeters, 7100);
    assert.equal(selected?.diagnostic.anomaly, true);
  });
});
