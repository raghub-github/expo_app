import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MARKER_NOISE_MOVE_M,
  MARKER_STATIONARY_SPEED_MPS,
  MARKER_UI_UPDATE_MIN_MS,
  shouldFreezeSmoothedMarker,
  shouldIgnoreMarkerGpsNoise,
  shouldPublishSmoothedMarkerUi,
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
    assert.equal(resolveSmoothDurationMs(null), 620);
    assert.equal(resolveSmoothDurationMs(0.2), 620);
    assert.equal(resolveSmoothDurationMs(1), 480);
    assert.equal(resolveSmoothDurationMs(5), 360);
    assert.equal(resolveSmoothDurationMs(12), 280);
  });
});

describe("shouldPublishSmoothedMarkerUi", () => {
  it("always publishes the first sample and the lerp completion", () => {
    assert.equal(
      shouldPublishSmoothedMarkerUi({
        lastPublishMs: 0,
        nowMs: 10,
        moveSincePublishM: 0,
        isComplete: false,
      }),
      true
    );
    assert.equal(
      shouldPublishSmoothedMarkerUi({
        lastPublishMs: 1_000,
        nowMs: 1_010,
        moveSincePublishM: 0,
        isComplete: true,
      }),
      true
    );
  });

  it("throttles sub-200ms React publishes even when the marker moved", () => {
    assert.equal(
      shouldPublishSmoothedMarkerUi({
        lastPublishMs: 1_000,
        nowMs: 1_000 + MARKER_UI_UPDATE_MIN_MS - 1,
        moveSincePublishM: 5,
        isComplete: false,
      }),
      false
    );
    assert.equal(
      shouldPublishSmoothedMarkerUi({
        lastPublishMs: 1_000,
        nowMs: 1_000 + MARKER_UI_UPDATE_MIN_MS,
        moveSincePublishM: 5,
        isComplete: false,
      }),
      true
    );
  });

  it("skips tiny moves after the interval so GPS noise does not rerender the tree", () => {
    assert.equal(
      shouldPublishSmoothedMarkerUi({
        lastPublishMs: 1_000,
        nowMs: 1_400,
        moveSincePublishM: 0.2,
        isComplete: false,
      }),
      false
    );
  });
});
