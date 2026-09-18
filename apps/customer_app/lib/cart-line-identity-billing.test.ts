import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isNumericMenuItemPk,
  rewriteCartMenuItemBase,
} from "./cart-line-identity";

describe("rewriteCartMenuItemBase", () => {
  it("rewrites public SKU to numeric PK", () => {
    assert.equal(rewriteCartMenuItemBase("SS1026_bab625641ca8aecf", "42"), "42");
  });

  it("rewrites composite public SKU base", () => {
    assert.equal(
      rewriteCartMenuItemBase("SS1026_bab625641ca8aecf::v1::a1", "42"),
      "42::v1::a1"
    );
  });

  it("leaves numeric PK unchanged", () => {
    assert.equal(rewriteCartMenuItemBase("42", "99"), null);
    assert.equal(rewriteCartMenuItemBase("42::v1::", "99"), null);
  });

  it("rejects invalid next base", () => {
    assert.equal(rewriteCartMenuItemBase("SS1026_x", "SS1026_y"), null);
    assert.equal(rewriteCartMenuItemBase("SS1026_x", "0"), null);
  });
});

describe("isNumericMenuItemPk", () => {
  it("accepts positive integers only", () => {
    assert.equal(isNumericMenuItemPk("42"), true);
    assert.equal(isNumericMenuItemPk("SS1026_x"), false);
    assert.equal(isNumericMenuItemPk("0"), false);
  });
});
