import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  validateCoords,
  coordsMovedSignificantly,
  haversineMeters,
  withTimeout,
} from "./coords";

describe("validateCoords", () => {
  it("rejects null/undefined", () => {
    assert.equal(validateCoords(null), null);
    assert.equal(validateCoords(undefined), null);
  });

  it("rejects null-island and out-of-range", () => {
    assert.equal(validateCoords({ coords: { latitude: 0, longitude: 0 } }), null);
    assert.equal(validateCoords({ coords: { latitude: 91, longitude: 10 } }), null);
    assert.equal(validateCoords({ coords: { latitude: 10, longitude: 181 } }), null);
    assert.equal(validateCoords({ coords: { latitude: NaN, longitude: 10 } }), null);
  });

  it("accepts valid coords with accuracy", () => {
    const v = validateCoords({
      coords: { latitude: 28.61, longitude: 77.2, accuracy: 12 },
    });
    assert.deepEqual(v, { latitude: 28.61, longitude: 77.2, accuracy: 12 });
  });
});

describe("coordsMovedSignificantly", () => {
  it("treats null mismatch as moved", () => {
    assert.equal(coordsMovedSignificantly(null, { latitude: 1, longitude: 1 }), true);
  });

  it("detects moves above threshold", () => {
    const a = { latitude: 28.61, longitude: 77.2 };
    const b = { latitude: 28.62, longitude: 77.2 };
    const meters = haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude);
    assert.ok(meters > 900);
    assert.equal(coordsMovedSignificantly(a, b, 350), true);
    assert.equal(coordsMovedSignificantly(a, a, 350), false);
  });
});

describe("withTimeout", () => {
  it("resolves before timeout", async () => {
    const v = await withTimeout(Promise.resolve(42), 100);
    assert.equal(v, 42);
  });

  it("rejects on timeout", async () => {
    await assert.rejects(
      () => withTimeout(new Promise(() => {}), 20),
      /Location request timed out/
    );
  });
});
