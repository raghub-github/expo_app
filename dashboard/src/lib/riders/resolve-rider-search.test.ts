import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRiderDashboardSearch,
  extractIndianMobileLast10,
  riderMobileSearchVariants,
  riderSearchMatchesLoadedRider,
} from "./resolve-rider-search.ts";

describe("classifyRiderDashboardSearch", () => {
  it("parses GMR and numeric rider ids", () => {
    assert.deepEqual(classifyRiderDashboardSearch("GMR1008"), {
      kind: "id",
      id: 1008,
    });
    assert.deepEqual(classifyRiderDashboardSearch("1008"), {
      kind: "id",
      id: 1008,
    });
  });

  it("normalizes Indian phone formats to last10", () => {
    const cases = [
      "9999999999",
      "+919999999999",
      "09999999999",
      "919999999999",
      "+91 9999999999",
    ];
    for (const input of cases) {
      const c = classifyRiderDashboardSearch(input);
      assert.equal(c?.kind, "phone");
      if (c?.kind === "phone") {
        assert.equal(c.last10, "9999999999");
        assert.ok(c.variants.includes("9999999999"));
        assert.ok(c.variants.includes("919999999999"));
        assert.ok(c.variants.includes("+919999999999"));
        assert.ok(c.variants.includes("09999999999"));
      }
    }
  });

  it("extractIndianMobileLast10 handles screenshot format", () => {
    assert.equal(extractIndianMobileLast10("+919113194305"), "9113194305");
  });

  it("matches loaded rider across phone formats", () => {
    const rider = { id: 1008, mobile: "9113194305" };
    assert.equal(riderSearchMatchesLoadedRider("+919113194305", rider), true);
    assert.equal(riderSearchMatchesLoadedRider("09113194305", rider), true);
    assert.equal(riderSearchMatchesLoadedRider("919113194305", rider), true);
    assert.equal(riderSearchMatchesLoadedRider("GMR1008", rider), true);
    assert.equal(riderSearchMatchesLoadedRider("1007", rider), false);
  });

  it("builds expected mobile variants", () => {
    assert.deepEqual(riderMobileSearchVariants("9999999999").sort(), [
      "+91 9999999999",
      "+919999999999",
      "09999999999",
      "91 9999999999",
      "919999999999",
      "9999999999",
    ].sort());
  });
});
