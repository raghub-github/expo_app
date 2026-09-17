import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  haversineDistanceMeters,
  isRiderWithinPickupRadiusMeters,
  classifyRiderLocationFreshness,
  sortEligibleRidersFreshnessFirst,
  preferFreshEligibleRiders,
  freshnessRank,
  decideNewOfferLocationRadiusGate,
  normalizeDispatchExclusionReason,
} from "./order-assignment-engine.js";

describe("order-assignment-engine pickup radius", () => {
  const pickup = { latitude: 12.9716, longitude: 77.5946 };

  it("includes rider at pickup point", () => {
    assert.equal(
      isRiderWithinPickupRadiusMeters(pickup.latitude, pickup.longitude, pickup, 3000),
      true
    );
  });

  it("includes rider exactly at configured radius (3000 m)", () => {
    const metersNorth = 3000;
    const latOffset = metersNorth / 111_320;
    const riderLat = pickup.latitude + latOffset;
    const distance = haversineDistanceMeters(riderLat, pickup.longitude, pickup.latitude, pickup.longitude);
    assert.ok(distance <= 3000, `expected <= 3000 m, got ${distance}`);
    assert.equal(
      isRiderWithinPickupRadiusMeters(riderLat, pickup.longitude, pickup, 3000),
      true
    );
  });

  it("excludes rider beyond configured radius", () => {
    let riderLat = pickup.latitude;
    while (
      haversineDistanceMeters(riderLat, pickup.longitude, pickup.latitude, pickup.longitude) <=
      3000
    ) {
      riderLat += 0.00001;
    }
    const distance = haversineDistanceMeters(
      riderLat,
      pickup.longitude,
      pickup.latitude,
      pickup.longitude
    );
    assert.ok(distance > 3000, `expected > 3000 m, got ${distance}`);
    assert.equal(
      isRiderWithinPickupRadiusMeters(riderLat, pickup.longitude, pickup, 3000),
      false
    );
  });

  it("rejects invalid pickup coordinates", () => {
    assert.equal(isRiderWithinPickupRadiusMeters(12.97, 77.59, { latitude: 0, longitude: 0 }, 3000), false);
  });

  it("rejects non-positive configured radius", () => {
    assert.equal(isRiderWithinPickupRadiusMeters(pickup.latitude, pickup.longitude, pickup, 0), false);
  });
});

describe("classifyRiderLocationFreshness", () => {
  const now = Date.parse("2026-09-04T06:00:00.000Z");

  it("treats missing GPS as UNKNOWN without implying off duty", () => {
    assert.equal(classifyRiderLocationFreshness(null, now, 120, 900), "UNKNOWN");
  });

  it("classifies FRESH within the fresh window", () => {
    assert.equal(
      classifyRiderLocationFreshness(new Date(now - 30_000), now, 120, 900),
      "FRESH"
    );
  });

  it("classifies STALE between fresh and stale max — still dispatchable", () => {
    assert.equal(
      classifyRiderLocationFreshness(new Date(now - 180_000), now, 120, 900),
      "STALE"
    );
  });

  it("classifies UNKNOWN after the stale window — duty must stay ON separately", () => {
    assert.equal(
      classifyRiderLocationFreshness(new Date(now - 901_000), now, 120, 900),
      "UNKNOWN"
    );
  });
});

describe("sortEligibleRidersFreshnessFirst", () => {
  it("ranks FRESH above STALE even when STALE is closer (nearest strategy)", () => {
    // Pre-sorted by distance: A (STALE, nearer) then B (FRESH, farther).
    const byDistance = [
      {
        riderId: 1,
        freshness: "STALE" as const,
        distanceMeters: 400,
        gpsAgeSeconds: 300,
        accuracyM: 25,
      },
      {
        riderId: 2,
        freshness: "FRESH" as const,
        distanceMeters: 550,
        gpsAgeSeconds: 20,
        accuracyM: 12,
      },
    ];
    const ranked = sortEligibleRidersFreshnessFirst(byDistance);
    assert.equal(ranked[0].riderId, 2, "FRESH rider must win over nearer STALE");
    assert.equal(ranked[1].riderId, 1);
  });

  it("preserves distance/score order within the same freshness tier", () => {
    const sameFresh = [
      { riderId: 10, freshness: "FRESH" as const, distanceMeters: 800 },
      { riderId: 11, freshness: "FRESH" as const, distanceMeters: 200 },
      { riderId: 12, freshness: "STALE" as const, distanceMeters: 100 },
    ];
    // Caller already ranked by distance within tiers mixed; after freshness-first,
    // both FRESH keep relative order (10 before 11), then STALE.
    const ranked = sortEligibleRidersFreshnessFirst(sameFresh);
    assert.deepEqual(
      ranked.map((r) => r.riderId),
      [10, 11, 12]
    );
  });

  it("freshnessRank orders FRESH < STALE < UNKNOWN", () => {
    assert.ok(freshnessRank("FRESH") < freshnessRank("STALE"));
    assert.ok(freshnessRank("STALE") < freshnessRank("UNKNOWN"));
  });
});

describe("preferFreshEligibleRiders", () => {
  it("keeps only FRESH when any FRESH riders are present", () => {
    const mixed = [
      { riderId: 1, freshness: "STALE" as const },
      { riderId: 2, freshness: "FRESH" as const },
      { riderId: 3, freshness: "STALE" as const },
      { riderId: 4, freshness: "FRESH" as const },
    ];
    const preferred = preferFreshEligibleRiders(mixed);
    assert.deepEqual(
      preferred.map((r) => r.riderId),
      [2, 4]
    );
  });

  it("keeps STALE when zero FRESH riders are in the list", () => {
    const onlyStale = [
      { riderId: 7, freshness: "STALE" as const },
      { riderId: 8, freshness: "STALE" as const },
    ];
    const preferred = preferFreshEligibleRiders(onlyStale);
    assert.deepEqual(
      preferred.map((r) => r.riderId),
      [7, 8]
    );
  });
});

describe("decideNewOfferLocationRadiusGate (app-killed / WS-independent)", () => {
  const radius = 3000;

  it("TEST A: ONLINE + FRESH + within radius → ELIGIBLE (app running implied)", () => {
    const d = decideNewOfferLocationRadiusGate({
      dutyOn: true,
      freshness: "FRESH",
      distanceMeters: 400,
      radiusMeters: radius,
    });
    assert.deepEqual(d, { eligible: true, reason: "ELIGIBLE" });
  });

  it("TEST B/C/D: ONLINE + FRESH remains eligible regardless of app/WS (gate has no presence inputs)", () => {
    const d = decideNewOfferLocationRadiusGate({
      dutyOn: true,
      freshness: "FRESH",
      distanceMeters: 1200,
      radiusMeters: radius,
    });
    assert.equal(d.eligible, true);
    assert.equal(d.reason, "ELIGIBLE");
  });

  it("TEST E: ONLINE + UNKNOWN (past usable window) → LOCATION_STALE", () => {
    const d = decideNewOfferLocationRadiusGate({
      dutyOn: true,
      freshness: "UNKNOWN",
      distanceMeters: 400,
      radiusMeters: radius,
    });
    assert.deepEqual(d, { eligible: false, reason: "LOCATION_STALE" });
  });

  it("TEST E-band: ONLINE + STALE within usable window still ELIGIBLE (existing policy)", () => {
    const d = decideNewOfferLocationRadiusGate({
      dutyOn: true,
      freshness: "STALE",
      distanceMeters: 400,
      radiusMeters: radius,
    });
    assert.deepEqual(d, { eligible: true, reason: "ELIGIBLE" });
  });

  it("TEST F: ONLINE + missing location → LOCATION_MISSING", () => {
    const d = decideNewOfferLocationRadiusGate({
      dutyOn: true,
      freshness: null,
      distanceMeters: null,
      radiusMeters: radius,
    });
    assert.deepEqual(d, { eligible: false, reason: "LOCATION_MISSING" });
  });

  it("TEST G: OFFLINE + FRESH → RIDER_OFFLINE", () => {
    const d = decideNewOfferLocationRadiusGate({
      dutyOn: false,
      freshness: "FRESH",
      distanceMeters: 100,
      radiusMeters: radius,
    });
    assert.deepEqual(d, { eligible: false, reason: "RIDER_OFFLINE" });
  });

  it("TEST H: ONLINE + FRESH + outside radius → OUTSIDE_RADIUS", () => {
    const d = decideNewOfferLocationRadiusGate({
      dutyOn: true,
      freshness: "FRESH",
      distanceMeters: 3000.1,
      radiusMeters: radius,
    });
    assert.deepEqual(d, { eligible: false, reason: "OUTSIDE_RADIUS" });
  });

  it("includes rider exactly at radius boundary", () => {
    const d = decideNewOfferLocationRadiusGate({
      dutyOn: true,
      freshness: "FRESH",
      distanceMeters: 3000,
      radiusMeters: radius,
    });
    assert.equal(d.eligible, true);
  });
});

describe("normalizeDispatchExclusionReason", () => {
  it("maps legacy and new codes without inventing APP_KILLED", () => {
    assert.equal(normalizeDispatchExclusionReason("off_duty"), "RIDER_OFFLINE");
    assert.equal(normalizeDispatchExclusionReason("LOCATION_STALE"), "LOCATION_STALE");
    assert.equal(normalizeDispatchExclusionReason("outside_wave_radius"), "OUTSIDE_RADIUS");
    assert.equal(normalizeDispatchExclusionReason("subscription_blocked"), "SUBSCRIPTION_REQUIRED");
    assert.notEqual(normalizeDispatchExclusionReason("other"), "APP_KILLED" as never);
  });
});
