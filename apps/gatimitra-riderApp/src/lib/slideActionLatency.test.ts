import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  beginSlideAction,
  getSlideActionName,
  getSlideActionT0,
  markSlideAction,
} from "./slideActionLatency";

describe("slideActionLatency", () => {
  it("records T0 immediately and T1 in the same tick as ~0ms", () => {
    const t0 = beginSlideAction("reached_pickup", "ord_1");
    markSlideAction("T1_HANDLER");
    assert.equal(getSlideActionName(), "reached_pickup");
    assert.equal(getSlideActionT0(), t0);
    const t1 = markSlideAction("T1_HANDLER");
    assert.ok(t1 - t0 < 20);
  });
});
