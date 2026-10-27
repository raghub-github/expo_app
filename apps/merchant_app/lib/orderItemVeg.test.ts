import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isOrderVegOnly, resolveItemVegType } from "./orderItemVeg";

describe("resolveItemVegType", () => {
  it("treats Plain Chappati spelling as veg", () => {
    assert.equal(resolveItemVegType(null, "Plain Chappati"), "veg");
    assert.equal(resolveItemVegType(null, "plain chapati"), "veg");
  });

  it("keeps chole bhature as veg and chicken as non-veg", () => {
    assert.equal(resolveItemVegType(null, "Chole Bhature"), "veg");
    assert.equal(resolveItemVegType(null, "Kadai Chicken"), "non_veg");
  });

  it("respects explicit egg / non_veg food_type", () => {
    assert.equal(resolveItemVegType("EGG", "Something"), "egg");
    assert.equal(resolveItemVegType("NON_VEG", "Dal"), "non_veg");
    assert.equal(resolveItemVegType("VEG", "Mystery"), "veg");
  });
});

describe("isOrderVegOnly", () => {
  it("shows pill for Plain Chappati only orders", () => {
    assert.equal(isOrderVegOnly([{ name: "Plain Chappati", vegNonveg: null }]), true);
  });

  it("shows pill for Chole Bhature", () => {
    assert.equal(isOrderVegOnly([{ name: "Chole Bhature", vegNonveg: null }]), true);
  });

  it("hides pill when any line is non-veg or egg", () => {
    assert.equal(
      isOrderVegOnly([
        { name: "Plain Chappati", vegNonveg: null },
        { name: "Egg Curry", vegNonveg: null },
      ]),
      false
    );
    assert.equal(
      isOrderVegOnly([
        { name: "Chapati", vegNonveg: "VEG" },
        { name: "Chicken", vegNonveg: "NON_VEG" },
      ]),
      false
    );
  });
});
