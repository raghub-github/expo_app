import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COALESCE_MIN_MOVE_M,
  COALESCE_IDLE_HOME_MOVE_M,
  COALESCE_IDLE_HOME_HEADING_DEG,
  coalesceHaversineM,
  coalesceHeadingDeltaDeg,
  shouldSkipCoalescedFix,
} from "./coalesceLocationUi";

describe("coalesceLocationUi", () => {
  it("treats ~1m GPS jitter as skippable when heading is stable", () => {
    const last = { lat: 17.44, lng: 78.38, heading: 90, atMs: 1_000 };
    const next = { lat: 17.440008, lng: 78.38, headingDeg: 91 };
    assert.equal(shouldSkipCoalescedFix(last, next, 1_500), true);
  });

  it("commits a real move beyond the floor", () => {
    const last = { lat: 17.44, lng: 78.38, heading: 90, atMs: 1_000 };
    const moved = coalesceHaversineM(17.44, 78.38, 17.44003, 78.38);
    assert.ok(moved > COALESCE_MIN_MOVE_M);
    assert.equal(
      shouldSkipCoalescedFix(last, { lat: 17.44003, lng: 78.38, headingDeg: 90 }, 1_500),
      false
    );
  });

  it("wraps heading delta across 360", () => {
    assert.equal(coalesceHeadingDeltaDeg(359, 1), 2);
  });

  it("keeps skipping jitter after several seconds of standing still", () => {
    const last = { lat: 17.44, lng: 78.38, heading: 90, atMs: 1_000 };
    const next = { lat: 17.440008, lng: 78.38, headingDeg: 91 };
    assert.equal(shouldSkipCoalescedFix(last, next, 30_000), true);
  });

  it("idle Home coalesces ~8m GPS noise so the map pin does not tick", () => {
    const last = { lat: 17.44, lng: 78.38, heading: 90, atMs: 1_000 };
    const noisy = { lat: 17.44006, lng: 78.38, headingDeg: 92 };
    const moved = coalesceHaversineM(last.lat, last.lng, noisy.lat, noisy.lng);
    assert.ok(moved > 2 && moved < 12);
    assert.equal(
      shouldSkipCoalescedFix(last, noisy, 1_500, {
        minMoveM: COALESCE_IDLE_HOME_MOVE_M,
        minHeadingDeg: COALESCE_IDLE_HOME_HEADING_DEG,
      }),
      true
    );
  });
});
