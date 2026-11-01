import {
  SLIDE_DIRECTION_BIAS,
  SLIDE_HORIZONTAL_SLOP,
  shouldClaimSlide,
  shouldCompleteSlide,
} from "@/src/lib/slideGesture";
import { SLIDE_COMPLETE_RATIO } from "@/src/lib/slideCompleteThreshold";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("shouldClaimSlide", () => {
  it("ignores a touch that has not moved (a tap must not steal the gesture)", () => {
    assert.equal(shouldClaimSlide({ dx: 0, dy: 0 }, false), false);
  });

  it("ignores travel below the horizontal slop", () => {
    assert.equal(shouldClaimSlide({ dx: SLIDE_HORIZONTAL_SLOP, dy: 0 }, false), false);
  });

  it("claims a clear horizontal drag", () => {
    assert.equal(shouldClaimSlide({ dx: SLIDE_HORIZONTAL_SLOP + 1, dy: 0 }, false), true);
    assert.equal(shouldClaimSlide({ dx: 40, dy: 5 }, false), true);
  });

  it("leaves a vertical drag to the parent scroll view", () => {
    // The regression: a finger landing on the track used to swallow the page
    // scroll, so sheets and lists felt stuck behind every slider.
    assert.equal(shouldClaimSlide({ dx: 10, dy: 60 }, false), false);
    assert.equal(shouldClaimSlide({ dx: 30, dy: 30 }, false), false);
  });

  it("requires horizontal travel to beat vertical by the direction bias", () => {
    const dy = 20;
    assert.equal(shouldClaimSlide({ dx: dy * SLIDE_DIRECTION_BIAS, dy }, false), false);
    assert.equal(shouldClaimSlide({ dx: dy * SLIDE_DIRECTION_BIAS + 1, dy }, false), true);
  });

  it("never claims while the slider is busy, disabled or locked", () => {
    assert.equal(shouldClaimSlide({ dx: 200, dy: 0 }, true), false);
  });

  it("does not claim a right-to-left drag", () => {
    // abs() passes the slop, but a backwards drag must not complete anything;
    // shouldCompleteSlide is what rejects it.
    assert.equal(shouldCompleteSlide(-200, 200, SLIDE_COMPLETE_RATIO), false);
  });
});

describe("shouldCompleteSlide", () => {
  const MAX = 200;

  it("refuses when the track has not been measured yet", () => {
    // Regression: max === 0 made `dx < max * ratio` false, so ANY drag fired
    // the action. An accidental accept is far worse than a lost swipe.
    assert.equal(shouldCompleteSlide(5, 0, SLIDE_COMPLETE_RATIO), false);
    assert.equal(shouldCompleteSlide(500, 0, SLIDE_COMPLETE_RATIO), false);
    assert.equal(shouldCompleteSlide(5, -10, SLIDE_COMPLETE_RATIO), false);
  });

  it("refuses a short drag", () => {
    assert.equal(shouldCompleteSlide(MAX * SLIDE_COMPLETE_RATIO - 1, MAX, SLIDE_COMPLETE_RATIO), false);
  });

  it("completes exactly at the threshold", () => {
    assert.equal(shouldCompleteSlide(MAX * SLIDE_COMPLETE_RATIO, MAX, SLIDE_COMPLETE_RATIO), true);
  });

  it("completes past the threshold and beyond the track", () => {
    assert.equal(shouldCompleteSlide(MAX, MAX, SLIDE_COMPLETE_RATIO), true);
    assert.equal(shouldCompleteSlide(MAX + 80, MAX, SLIDE_COMPLETE_RATIO), true);
  });

  it("rejects non-finite input rather than firing", () => {
    // Garbage in must never fire a money action: refuse, do not complete.
    assert.equal(shouldCompleteSlide(Number.NaN, MAX, SLIDE_COMPLETE_RATIO), false);
    assert.equal(shouldCompleteSlide(MAX, Number.NaN, SLIDE_COMPLETE_RATIO), false);
    assert.equal(shouldCompleteSlide(Number.POSITIVE_INFINITY, MAX, SLIDE_COMPLETE_RATIO), false);
  });
});
