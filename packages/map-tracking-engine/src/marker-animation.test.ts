import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MARKER_NOISE_MOVE_M,
  MARKER_STATIONARY_SPEED_MPS,
  shouldFreezeSmoothedMarker,
  shouldIgnoreMarkerGpsNoise,
  resolveSmoothDurationMs,
} from "./marker-animation";

describe("shouldIgnoreMarkerGpsNoise", () => {
  it("ignores sub-meter duplicate fixes", () => {
    assert.equal(shouldIgnoreMarkerGpsNoise(0.1), true);
    assert.equal(shouldIgnoreMarkerGpsNoise(MARKER_NOISE_MOVE_M - 0.01), true);
    assert.equal(shouldIgnoreMarkerGpsNoise(MARKER_NOISE_MOVE_M), false);
  });
});

describe("shouldFreezeSmoothedMarker", () => {
  it("freezes when speed is low even with moderate GPS drift", () => {
    assert.equal(shouldFreezeSmoothedMarker(8, 0.1), true);
    assert.equal(shouldFreezeSmoothedMarker(20, 0.2), true);
  });

  it("does not freeze when rider is moving", () => {
    assert.equal(shouldFreezeSmoothedMarker(5, 2.5), false);
    assert.equal(shouldFreezeSmoothedMarker(12, 1.2), false);
  });

  it("allows large jumps while stationary to recover GPS fixes", () => {
    assert.equal(shouldFreezeSmoothedMarker(30, 0.1), false);
  });

  it("freezes tiny moves at walking speed threshold", () => {
    assert.equal(
      shouldFreezeSmoothedMarker(1.2, MARKER_STATIONARY_SPEED_MPS - 0.05),
      true
    );
  });
});

describe("resolveSmoothDurationMs", () => {
  it("matches rider-app speed buckets", () => {
    assert.equal(resolveSmoothDurationMs(null), 550);
    assert.equal(resolveSmoothDurationMs(0.2), 550);
    assert.equal(resolveSmoothDurationMs(1), 420);
    assert.equal(resolveSmoothDurationMs(5), 320);
    assert.equal(resolveSmoothDurationMs(12), 240);
  });
});
