import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyNavigationGpsSample,
  canStartRouteRequest,
  EMPTY_OFF_ROUTE_CONFIRMATION,
  isStaleRouteResponse,
  offRouteThresholdM,
  resolveNavigationRouteStatus,
  shouldReplaceInFlightRouteRequest,
  type NavigationGpsFix,
  type OffRouteConfirmationState,
} from "./live-navigation";
import type { LatLng } from "./geo";

/** ~1.1 km north. */
const LONG_ROUTE: LatLng[] = [
  { latitude: 29.37, longitude: 76.96 },
  { latitude: 29.38, longitude: 76.96 },
];

const DEST: LatLng = { latitude: 29.38, longitude: 76.96 };

function fix(partial: Partial<NavigationGpsFix> & Pick<NavigationGpsFix, "latitude" | "longitude">): NavigationGpsFix {
  return {
    headingDeg: 0,
    speedMps: 8,
    accuracyM: 8,
    timestampMs: 1_000,
    ...partial,
  };
}

function runSamples(
  locations: NavigationGpsFix[],
  start: OffRouteConfirmationState = EMPTY_OFF_ROUTE_CONFIRMATION
) {
  let confirmation = start;
  let last = applyNavigationGpsSample({
    route: LONG_ROUTE,
    destination: DEST,
    location: locations[0]!,
    confirmation,
    nowMs: locations[0]!.timestampMs,
  });
  confirmation = last.next;
  for (let i = 1; i < locations.length; i++) {
    last = applyNavigationGpsSample({
      route: LONG_ROUTE,
      destination: DEST,
      location: locations[i]!,
      confirmation,
      nowMs: locations[i]!.timestampMs,
    });
    confirmation = last.next;
  }
  return last;
}

describe("offRouteThresholdM", () => {
  it("keeps a GPS-error floor and grows with poor accuracy", () => {
    assert.equal(offRouteThresholdM(8), 45);
    assert.ok(offRouteThresholdM(50) > 45);
  });
});

describe("isStaleRouteResponse", () => {
  it("rejects an older request after a newer one started", () => {
    assert.equal(isStaleRouteResponse(1, 2), true);
    assert.equal(isStaleRouteResponse(2, 2), false);
  });
});

describe("applyNavigationGpsSample — on route", () => {
  it("does not reroute when the rider stays on the polyline", () => {
    const last = runSamples([
      fix({ latitude: 29.3702, longitude: 76.96, timestampMs: 1_000 }),
      fix({ latitude: 29.3704, longitude: 76.96, timestampMs: 2_000 }),
      fix({ latitude: 29.3706, longitude: 76.96, timestampMs: 3_000 }),
    ]);
    assert.equal(last.potentiallyOffRoute, false);
    assert.equal(last.confirmedOffRoute, false);
    assert.equal(last.reason, "ON_ROUTE");
  });
});

describe("applyNavigationGpsSample — GPS noise", () => {
  it("does not reroute on a single jump away from the route", () => {
    const first = applyNavigationGpsSample({
      route: LONG_ROUTE,
      destination: DEST,
      location: fix({ latitude: 29.37, longitude: 76.9607, timestampMs: 1_000 }),
      confirmation: EMPTY_OFF_ROUTE_CONFIRMATION,
      nowMs: 1_000,
    });
    assert.equal(first.potentiallyOffRoute, true);
    assert.equal(first.confirmedOffRoute, false);

    const back = applyNavigationGpsSample({
      route: LONG_ROUTE,
      destination: DEST,
      location: fix({ latitude: 29.3702, longitude: 76.96, timestampMs: 2_000 }),
      confirmation: first.next,
      nowMs: 2_000,
    });
    assert.equal(back.confirmedOffRoute, false);
    assert.equal(back.potentiallyOffRoute, false);
  });

  it("ignores poor GPS accuracy instead of treating it as off-route", () => {
    const last = runSamples([
      fix({ latitude: 29.37, longitude: 76.9612, accuracyM: 95, timestampMs: 1_000 }),
      fix({ latitude: 29.3702, longitude: 76.9613, accuracyM: 110, timestampMs: 3_000 }),
      fix({ latitude: 29.3704, longitude: 76.9614, accuracyM: 90, timestampMs: 5_000 }),
    ]);
    assert.equal(last.confirmedOffRoute, false);
    assert.equal(last.reason, "POOR_ACCURACY");
  });
});

describe("applyNavigationGpsSample — confirmed off-route", () => {
  it("confirms after persistent deviation across several GPS updates", () => {
    const last = runSamples([
      fix({ latitude: 29.37, longitude: 76.9608, headingDeg: 90, timestampMs: 1_000 }),
      fix({ latitude: 29.37005, longitude: 76.96085, headingDeg: 90, timestampMs: 2_000 }),
      fix({ latitude: 29.3701, longitude: 76.9609, headingDeg: 90, timestampMs: 3_200 }),
    ]);
    assert.equal(last.potentiallyOffRoute, true);
    assert.equal(last.confirmedOffRoute, true);
    assert.equal(last.reason, "OFF_ROUTE");
  });
});

describe("applyNavigationGpsSample — parallel heading", () => {
  it("does not immediately confirm a parallel-road offset", () => {
    const last = runSamples([
      fix({ latitude: 29.37, longitude: 76.9605, headingDeg: 0, speedMps: 10, timestampMs: 1_000 }),
      fix({ latitude: 29.3702, longitude: 76.96052, headingDeg: 0, speedMps: 10, timestampMs: 2_000 }),
      fix({ latitude: 29.3704, longitude: 76.96054, headingDeg: 0, speedMps: 10, timestampMs: 3_000 }),
    ]);
    assert.equal(last.potentiallyOffRoute, true);
    assert.equal(last.confirmedOffRoute, false);
  });
});

describe("applyNavigationGpsSample — arrival", () => {
  it("marks arrival after two close samples and does not request reroute", () => {
    const a = applyNavigationGpsSample({
      route: LONG_ROUTE,
      destination: DEST,
      location: fix({ latitude: 29.38, longitude: 76.96, timestampMs: 1_000 }),
      confirmation: EMPTY_OFF_ROUTE_CONFIRMATION,
      nowMs: 1_000,
    });
    assert.equal(a.arrived, false);
    const b = applyNavigationGpsSample({
      route: LONG_ROUTE,
      destination: DEST,
      location: fix({ latitude: 29.38001, longitude: 76.96, timestampMs: 1_800 }),
      confirmation: a.next,
      nowMs: 1_800,
    });
    assert.equal(b.arrived, true);
    assert.equal(b.confirmedOffRoute, false);
  });
});

describe("canStartRouteRequest", () => {
  it("blocks off-route fetches during the minimum interval", () => {
    assert.equal(
      canStartRouteRequest({
        enabled: true,
        arrived: false,
        hasOrigin: true,
        hasDestination: true,
        reason: "OFF_ROUTE",
        lastRerouteAtMs: 19_000,
        nowMs: 20_000,
      }),
      false
    );
  });

  it("stops routing after arrival", () => {
    assert.equal(
      canStartRouteRequest({
        enabled: true,
        arrived: true,
        hasOrigin: true,
        hasDestination: true,
        reason: "OFF_ROUTE",
        lastRerouteAtMs: 0,
        nowMs: 20_000,
      }),
      false
    );
  });

  it("allows the initial current-position → destination request", () => {
    assert.equal(
      canStartRouteRequest({
        enabled: true,
        arrived: false,
        hasOrigin: true,
        hasDestination: true,
        reason: "INITIAL",
        lastRerouteAtMs: 0,
        nowMs: 1_000,
      }),
      true
    );
  });
});

describe("shouldReplaceInFlightRouteRequest", () => {
  it("does not replace a fresh in-flight request for a 10 m GPS nudge", () => {
    assert.equal(
      shouldReplaceInFlightRouteRequest({
        inFlight: true,
        inFlightOrigin: { latitude: 29.37, longitude: 76.96 },
        currentOrigin: { latitude: 29.37005, longitude: 76.96 },
        destChanged: false,
      }),
      false
    );
  });

  it("replaces when the rider has moved far while the old request is still open", () => {
    assert.equal(
      shouldReplaceInFlightRouteRequest({
        inFlight: true,
        inFlightOrigin: { latitude: 29.37, longitude: 76.96 },
        currentOrigin: { latitude: 29.371, longitude: 76.96 },
        destChanged: false,
      }),
      true
    );
  });
});

describe("resolveNavigationRouteStatus", () => {
  it("does not use contradictory flags — rerouting wins over off-route while fetching", () => {
    assert.equal(
      resolveNavigationRouteStatus({
        enabled: true,
        hasOrigin: true,
        hasDestination: true,
        hasRoute: true,
        arrived: false,
        isFetching: true,
        confirmedOffRoute: true,
        fetchFailed: false,
      }),
      "REROUTING"
    );
    assert.equal(
      resolveNavigationRouteStatus({
        enabled: true,
        hasOrigin: true,
        hasDestination: true,
        hasRoute: true,
        arrived: true,
        isFetching: true,
        confirmedOffRoute: true,
        fetchFailed: true,
      }),
      "ARRIVED"
    );
  });
});
