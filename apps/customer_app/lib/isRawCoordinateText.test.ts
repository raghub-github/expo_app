import { test } from "node:test";
import assert from "node:assert/strict";
import { isRawCoordinateText, filterCoordinateAddressParts } from "./isRawCoordinateText";

test("detects lat,lng strings", () => {
  assert.equal(isRawCoordinateText("29.3701168, 76.9637708"), true);
  assert.equal(isRawCoordinateText("29.3701,76.9638"), true);
  assert.equal(isRawCoordinateText("  -28.5, 77.1  "), true);
});

test("rejects human place names", () => {
  assert.equal(isRawCoordinateText("Gali Number 2, Panipat"), false);
  assert.equal(isRawCoordinateText("Current location"), false);
  assert.equal(isRawCoordinateText(""), false);
  assert.equal(isRawCoordinateText(null), false);
});

test("filters coordinate parts from address lists", () => {
  assert.deepEqual(
    filterCoordinateAddressParts(["29.37, 76.96", "Panipat", "Haryana"]),
    ["Panipat", "Haryana"]
  );
});
