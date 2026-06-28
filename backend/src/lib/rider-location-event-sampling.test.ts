import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  clearRiderLocationPingStateForTests,
  shouldPersistRiderLocationEvent,
  RIDER_LOCATION_EVENT_MIN_INTERVAL_MS,
  RIDER_LOCATION_EVENT_MIN_MOVE_METERS,
} from "./rider-location-event-sampling.js";

const basePoint = {
  tsMs: 1_000_000,
  lat: 24.8,
  lng: 85.0,
};

describe("shouldPersistRiderLocationEvent", () => {
  beforeEach(() => {
    clearRiderLocationPingStateForTests();
  });

  it("persists the first event", () => {
    assert.deepEqual(
      shouldPersistRiderLocationEvent({
        prevPersisted: null,
        curr: basePoint,
        fraudScore: 0,
        fraudSignals: [],
      }),
      { persist: true, reason: "first" }
    );
  });

  it("samples out stationary pings inside the interval", () => {
    assert.deepEqual(
      shouldPersistRiderLocationEvent({
        prevPersisted: basePoint,
        curr: { ...basePoint, tsMs: basePoint.tsMs + 5_000 },
        fraudScore: 0,
        fraudSignals: [],
      }),
      { persist: false, reason: "sampled_out" }
    );
  });

  it("persists after the minimum interval", () => {
    assert.equal(
      shouldPersistRiderLocationEvent({
        prevPersisted: basePoint,
        curr: { ...basePoint, tsMs: basePoint.tsMs + RIDER_LOCATION_EVENT_MIN_INTERVAL_MS },
        fraudScore: 0,
        fraudSignals: [],
      }).reason,
      "interval"
    );
  });

  it("persists when rider moved enough", () => {
    assert.equal(
      shouldPersistRiderLocationEvent({
        prevPersisted: basePoint,
        curr: {
          ...basePoint,
          tsMs: basePoint.tsMs + 10_000,
          lat: basePoint.lat + RIDER_LOCATION_EVENT_MIN_MOVE_METERS / 111_000,
        },
        fraudScore: 0,
        fraudSignals: [],
      }).reason,
      "moved"
    );
  });

  it("persists forced business events", () => {
    assert.deepEqual(
      shouldPersistRiderLocationEvent({
        prevPersisted: basePoint,
        curr: { ...basePoint, tsMs: basePoint.tsMs + 1_000 },
        fraudScore: 0,
        fraudSignals: [],
        forceBusinessEvent: "order_accepted",
      }),
      { persist: true, reason: "business", businessEvent: "order_accepted" }
    );
  });

  it("persists fraud and mocked pings immediately", () => {
    assert.equal(
      shouldPersistRiderLocationEvent({
        prevPersisted: basePoint,
        curr: { ...basePoint, tsMs: basePoint.tsMs + 1_000, mocked: true },
        fraudScore: 0,
        fraudSignals: [],
      }).reason,
      "mocked"
    );

    assert.equal(
      shouldPersistRiderLocationEvent({
        prevPersisted: basePoint,
        curr: { ...basePoint, tsMs: basePoint.tsMs + 1_000 },
        fraudScore: 20,
        fraudSignals: ["TELEPORT"],
      }).reason,
      "fraud"
    );
  });
});
