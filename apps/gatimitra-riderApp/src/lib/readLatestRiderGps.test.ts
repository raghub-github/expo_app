import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isUsableMapCoordinate } from "./map-coordinates";

describe("isUsableMapCoordinate", () => {
  it("rejects the Mapbox world-origin and invalid numbers", () => {
    assert.equal(isUsableMapCoordinate(0, 0), false);
    assert.equal(isUsableMapCoordinate(NaN, 77), false);
    assert.equal(isUsableMapCoordinate(29.39, 76.97), true);
  });
});
