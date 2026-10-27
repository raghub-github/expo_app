import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyBoundToRange, isCustomRangeComplete } from "./orderDateRange";

describe("applyBoundToRange", () => {
  it("sets from and clears to so end must be picked again", () => {
    const next = applyBoundToRange("start", 100, 199, null, 500);
    assert.equal(next.startMs, 100);
    assert.equal(next.endMs, null);
    assert.equal(next.nextBound, "end");
  });

  it("sets from only when range was empty", () => {
    const next = applyBoundToRange("start", 100, 199, null, null);
    assert.equal(next.startMs, 100);
    assert.equal(next.endMs, null);
    assert.equal(next.nextBound, "end");
  });

  it("sets to and asks for from when from is missing", () => {
    const next = applyBoundToRange("end", 300, 399, null, null);
    assert.equal(next.startMs, null);
    assert.equal(next.endMs, 399);
    assert.equal(next.nextBound, "start");
  });

  it("sets to when it is after from", () => {
    const next = applyBoundToRange("end", 300, 399, 100, null);
    assert.equal(next.startMs, 100);
    assert.equal(next.endMs, 399);
    assert.equal(next.nextBound, "end");
  });

  it("clears from when new to is before old from", () => {
    const next = applyBoundToRange("end", 50, 99, 200, 299);
    assert.equal(next.startMs, null);
    assert.equal(next.endMs, 99);
    assert.equal(next.nextBound, "start");
  });
});

describe("isCustomRangeComplete", () => {
  it("requires both sides", () => {
    assert.equal(isCustomRangeComplete(null, 1), false);
    assert.equal(isCustomRangeComplete(1, null), false);
    assert.equal(isCustomRangeComplete(1, 2), true);
  });
});
