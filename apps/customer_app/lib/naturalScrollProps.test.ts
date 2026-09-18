import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildNaturalHorizontalScrollProps,
  buildNaturalVerticalScrollProps,
  naturalDecelerationRate,
  SCROLL_FLING_VELOCITY_EPS,
} from "./naturalScrollPropsCore";

describe("naturalScrollPropsCore", () => {
  it("keeps free-scroll horizontals without snap/paging flags", () => {
    const props = buildNaturalHorizontalScrollProps("ios");
    assert.equal(props.horizontal, true);
    assert.equal(props.nestedScrollEnabled, true);
    assert.equal(props.disableIntervalMomentum, false);
    assert.equal(props.decelerationRate, "normal");
    assert.equal(props.overScrollMode, "never");
    assert.equal(props.directionalLockEnabled, true);
  });

  it("uses a longer Android glide than RN default normal (0.985)", () => {
    assert.equal(typeof naturalDecelerationRate("android"), "number");
    const rate = buildNaturalHorizontalScrollProps("android").decelerationRate;
    assert.equal(rate, 0.994);
    assert.ok(typeof rate === "number" && rate > 0.985);
  });

  it("keeps vertical lists on natural deceleration with clean overscroll", () => {
    const props = buildNaturalVerticalScrollProps("ios");
    assert.equal(props.overScrollMode, "never");
    assert.equal(props.decelerationRate, "normal");
    assert.ok(SCROLL_FLING_VELOCITY_EPS > 0);
  });
});
