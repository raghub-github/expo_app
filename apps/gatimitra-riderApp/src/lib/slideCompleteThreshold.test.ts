import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SLIDE_COMPLETE_MIN_PX,
  SLIDE_COMPLETE_RATIO,
  slideCompleteThreshold,
} from "./slideCompleteThreshold";

describe("slideCompleteThreshold", () => {
  it("uses the absolute floor when the track is unknown", () => {
    assert.equal(slideCompleteThreshold(0), SLIDE_COMPLETE_MIN_PX);
    assert.equal(slideCompleteThreshold(-10), SLIDE_COMPLETE_MIN_PX);
  });

  it("requires 40% of the drag range on a typical track", () => {
    const max = 320;
    assert.equal(SLIDE_COMPLETE_RATIO, 0.4);
    assert.equal(slideCompleteThreshold(max), max * 0.4);
  });

  it("stays proportional on a short track (no early min override)", () => {
    assert.equal(slideCompleteThreshold(100), 40);
  });
});
