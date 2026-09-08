import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterPureVegMerchants, isMerchantPureVeg } from "./pureVegFilter";

describe("isMerchantPureVeg", () => {
  it("keeps declared pure-veg stores", () => {
    assert.equal(isMerchantPureVeg({ isPureVeg: true, name: "Green Bowl" }), true);
  });

  it("hides mixed stores even when the name is not obviously non-veg", () => {
    assert.equal(isMerchantPureVeg({ isPureVeg: false, name: "Spice Garden" }), false);
  });

  it("does not treat a missing isPureVeg flag as pure veg", () => {
    assert.equal(isMerchantPureVeg({ name: "Spice Garden" }), false);
    assert.equal(isMerchantPureVeg({ isPureVeg: null, name: "Spice Garden" }), false);
  });

  it("hides stores whose name is clearly non-veg even if flagged", () => {
    assert.equal(isMerchantPureVeg({ isPureVeg: true, name: "Chicken Hub" }), false);
  });
});

describe("filterPureVegMerchants", () => {
  it("is a no-op when vegOnly is false", () => {
    const rows = [{ isPureVeg: false, name: "Mix" }];
    assert.equal(filterPureVegMerchants(rows, false), rows);
  });

  it("drops mixed and unknown flags when vegOnly is true", () => {
    const rows = [
      { isPureVeg: true, name: "Green Bowl" },
      { isPureVeg: false, name: "Mix House" },
      { name: "Unknown Flag" },
    ];
    assert.deepEqual(filterPureVegMerchants(rows, true), [
      { isPureVeg: true, name: "Green Bowl" },
    ]);
  });
});
