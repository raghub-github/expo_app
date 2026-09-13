import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pickHiringGeoAnchor,
  resolveHiringFromChain,
} from "./rider-geo-hiring.js";

describe("rider geo hiring inheritance", () => {
  it("Test1: State OFF → children OFF inherited", () => {
    for (const level of ["region", "district"] as const) {
      const r = resolveHiringFromChain([
        { level, hiringEnabled: null },
        ...(level === "district"
          ? [{ level: "region", hiringEnabled: null as boolean | null }]
          : []),
        { level: "state", hiringEnabled: false },
      ]);
      assert.equal(r.hiringAllowed, false);
      assert.equal(r.source, "state");
    }
  });

  it("Test2: State OFF + District A ON → only A ON; sibling OFF inherited", () => {
    const a = resolveHiringFromChain([
      { level: "district", hiringEnabled: true },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(a.hiringAllowed, true);
    assert.equal(a.source, "district");

    const sibling = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(sibling.hiringAllowed, false);
    assert.equal(sibling.source, "state");
  });

  it("Test3: State ON → children ON inherited", () => {
    const r = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: true },
    ]);
    assert.equal(r.hiringAllowed, true);
    assert.equal(r.source, "state");
  });

  it("Test4: State ON + District A OFF → only A OFF; sibling ON inherited", () => {
    const a = resolveHiringFromChain([
      { level: "district", hiringEnabled: false },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: true },
    ]);
    assert.equal(a.hiringAllowed, false);
    assert.equal(a.source, "district");

    const sibling = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: true },
    ]);
    assert.equal(sibling.hiringAllowed, true);
    assert.equal(sibling.source, "state");
  });

  it("Test5: State OFF + Region A ON → region districts ON; other regions OFF", () => {
    const inRegionA = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: true },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(inRegionA.hiringAllowed, true);
    assert.equal(inRegionA.source, "region");

    const otherRegion = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(otherRegion.hiringAllowed, false);
    assert.equal(otherRegion.source, "state");
  });

  it("Test6: State ON + Region A OFF → region districts OFF; other regions ON", () => {
    const inRegionA = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: false },
      { level: "state", hiringEnabled: true },
    ]);
    assert.equal(inRegionA.hiringAllowed, false);
    assert.equal(inRegionA.source, "region");

    const otherRegion = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: true },
    ]);
    assert.equal(otherRegion.hiringAllowed, true);
    assert.equal(otherRegion.source, "state");
  });

  it("Test7: State OFF + Region A ON + District X OFF", () => {
    const x = resolveHiringFromChain([
      { level: "district", hiringEnabled: false },
      { level: "region", hiringEnabled: true },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(x.hiringAllowed, false);
    assert.equal(x.source, "district");

    const siblingInA = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: true },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(siblingInA.hiringAllowed, true);
    assert.equal(siblingInA.source, "region");

    const otherRegion = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(otherRegion.hiringAllowed, false);
    assert.equal(otherRegion.source, "state");
  });

  it("defaults ON when no explicit rows exist in the chain", () => {
    const r = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: null },
    ]);
    assert.equal(r.hiringAllowed, true);
    assert.equal(r.source, "default");
    assert.equal(r.explicit, false);
  });

  it("never propagates a child ON onto siblings (critical regression)", () => {
    // Medinipur West ON must not affect Jhargram / Medinipur East.
    const west = resolveHiringFromChain([
      { level: "district", hiringEnabled: true },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: false },
    ]);
    const jhargram = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: false },
    ]);
    const east = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(west.hiringAllowed, true);
    assert.equal(jhargram.hiringAllowed, false);
    assert.equal(east.hiringAllowed, false);
  });

  it("pickHiringGeoAnchor prefers district → region → state", () => {
    assert.deepEqual(
      pickHiringGeoAnchor({
        districtId: "d1",
        regionId: "r1",
        stateId: "s1",
      }),
      { level: "district", refId: "d1" },
    );
    assert.deepEqual(
      pickHiringGeoAnchor({ regionId: "r1", stateId: "s1" }),
      { level: "region", refId: "r1" },
    );
    assert.deepEqual(pickHiringGeoAnchor({ stateId: "s1" }), {
      level: "state",
      refId: "s1",
    });
    assert.equal(pickHiringGeoAnchor({}), null);
  });
});
