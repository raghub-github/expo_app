import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveHiringFromChain } from "./rider-geo-hiring-chain.js";

describe("dashboard rider geo hiring chain (admin)", () => {
  it("State OFF + one district ON does not turn siblings ON", () => {
    const on = resolveHiringFromChain([
      { level: "district", hiringEnabled: true },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: false },
    ]);
    const sibling = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(on.hiringAllowed, true);
    assert.equal(on.source, "district");
    assert.equal(sibling.hiringAllowed, false);
    assert.equal(sibling.source, "state");
  });

  it("Region ON under State OFF covers only that region's districts", () => {
    const inRegion = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: true },
      { level: "state", hiringEnabled: false },
    ]);
    const other = resolveHiringFromChain([
      { level: "district", hiringEnabled: null },
      { level: "region", hiringEnabled: null },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(inRegion.hiringAllowed, true);
    assert.equal(inRegion.source, "region");
    assert.equal(other.hiringAllowed, false);
  });

  it("District ON with parents ON and siblings explicit OFF (cascade model)", () => {
    // After admin turns Medinipur West ON: State ON, Region ON, West ON, siblings OFF.
    const west = resolveHiringFromChain([
      { level: "district", hiringEnabled: true },
      { level: "region", hiringEnabled: true },
      { level: "state", hiringEnabled: true },
    ]);
    const sibling = resolveHiringFromChain([
      { level: "district", hiringEnabled: false },
      { level: "region", hiringEnabled: true },
      { level: "state", hiringEnabled: true },
    ]);
    const otherRegionDistrict = resolveHiringFromChain([
      { level: "district", hiringEnabled: false },
      { level: "region", hiringEnabled: false },
      { level: "state", hiringEnabled: true },
    ]);
    assert.equal(west.hiringAllowed, true);
    assert.equal(west.source, "district");
    assert.equal(sibling.hiringAllowed, false);
    assert.equal(sibling.source, "district");
    assert.equal(otherRegionDistrict.hiringAllowed, false);
    assert.equal(otherRegionDistrict.source, "district");
  });

  it("State OFF forces every child OFF (effective)", () => {
    const d = resolveHiringFromChain([
      { level: "district", hiringEnabled: false },
      { level: "region", hiringEnabled: false },
      { level: "state", hiringEnabled: false },
    ]);
    assert.equal(d.hiringAllowed, false);
  });

  it("Region OFF + district OFF while another region stays ON", () => {
    const offPath = resolveHiringFromChain([
      { level: "district", hiringEnabled: false },
      { level: "region", hiringEnabled: false },
      { level: "state", hiringEnabled: true },
    ]);
    const onPath = resolveHiringFromChain([
      { level: "district", hiringEnabled: true },
      { level: "region", hiringEnabled: true },
      { level: "state", hiringEnabled: true },
    ]);
    assert.equal(offPath.hiringAllowed, false);
    assert.equal(onPath.hiringAllowed, true);
  });
});
