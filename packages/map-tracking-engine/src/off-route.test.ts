import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyzeRiderOnRoute,
  NEAR_DESTINATION_SKIP_REROUTE_M,
  OFF_ROUTE_REROUTE_M,
  REROUTE_COOLDOWN_MS,
  shouldRequestReroute,
  WRONG_WAY_REROUTE_M,
} from "./off-route";
import type { LatLng } from "./geo";

/** ~111 m north of origin. */
const SHORT_ROUTE: LatLng[] = [
  { latitude: 29.37, longitude: 76.96 },
  { latitude: 29.3704, longitude: 76.96 },
];

/** ~1.1 km north of origin. */
const LONG_ROUTE: LatLng[] = [
  { latitude: 29.37, longitude: 76.96 },
  { latitude: 29.38, longitude: 76.96 },
];

describe("analyzeRiderOnRoute near destination", () => {
  it("does not reroute for 15 m GPS jitter + wrong-way on a short remaining path", () => {
    const rider = {
      latitude: 29.37,
      longitude: 76.96015, // ~14 m east
      headingDeg: 180,
    };
    const deviation = analyzeRiderOnRoute(SHORT_ROUTE, rider);
    assert.ok(deviation);
    assert.ok(deviation.offRouteM > 12 && deviation.offRouteM < 25);
    assert.equal(deviation.wrongWay, true);
    assert.ok(deviation.remainingDistanceM <= NEAR_DESTINATION_SKIP_REROUTE_M);
    assert.equal(deviation.shouldReroute, false);
  });

  it("reroutes when far from destination and clearly off the road", () => {
    const rider = {
      latitude: 29.37,
      longitude: 76.96055, // ~53 m east
      headingDeg: 90,
    };
    const deviation = analyzeRiderOnRoute(LONG_ROUTE, rider);
    assert.ok(deviation);
    assert.ok(deviation.offRouteM > OFF_ROUTE_REROUTE_M);
    assert.ok(deviation.remainingDistanceM > NEAR_DESTINATION_SKIP_REROUTE_M);
    assert.equal(deviation.shouldReroute, true);
  });

  it("does not treat 15 m wrong-way as a reroute on a long remaining path", () => {
    const rider = {
      latitude: 29.37,
      longitude: 76.96015,
      headingDeg: 180,
    };
    const deviation = analyzeRiderOnRoute(LONG_ROUTE, rider);
    assert.ok(deviation);
    assert.ok(deviation.offRouteM < WRONG_WAY_REROUTE_M);
    assert.equal(deviation.shouldReroute, false);
  });
});

describe("shouldRequestReroute", () => {
  const farOff = analyzeRiderOnRoute(LONG_ROUTE, {
    latitude: 29.37,
    longitude: 76.96055,
    headingDeg: 90,
  });

  it("allows a reroute when cooldown has elapsed", () => {
    assert.equal(shouldRequestReroute(farOff, 0, REROUTE_COOLDOWN_MS + 1), true);
  });

  it("blocks a reroute during cooldown", () => {
    const now = 50_000;
    assert.equal(shouldRequestReroute(farOff, now - 1_000, now), false);
  });

  it("blocks when the engine says not to reroute", () => {
    const near = analyzeRiderOnRoute(SHORT_ROUTE, {
      latitude: 29.37,
      longitude: 76.96015,
      headingDeg: 180,
    });
    assert.equal(shouldRequestReroute(near, 0, REROUTE_COOLDOWN_MS + 1), false);
  });
});
