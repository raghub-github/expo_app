import { describe, expect, it } from "vitest";
import {
  buildListCardOfferLine,
  isSelectedItemBoostScope,
} from "./merchant-offer-headline.js";

describe("buildListCardOfferLine", () => {
  it("Boost selected items → x% OFF on selected item", () => {
    expect(
      buildListCardOfferLine({
        type: "PERCENTAGE",
        offerSubType: "SPECIFIC_ITEM",
        discountPct: 25,
        discountVal: null,
        maxDiscount: null,
        minOrder: null,
        buyQty: null,
        getQty: null,
        menuItemIds: ["a", "b"],
        conditionsMode: "boost",
      })
    ).toBe("25% OFF on selected item");
  });

  it("Boost selected via menu ids only (sub type missing)", () => {
    expect(
      buildListCardOfferLine({
        type: "PERCENTAGE",
        offerSubType: null,
        discountPct: 25,
        discountVal: null,
        maxDiscount: null,
        minOrder: null,
        buyQty: null,
        getQty: null,
        menuItemIds: ["x"],
        conditionsMode: "boost",
      })
    ).toBe("25% OFF on selected item");
  });

  it("Boost all items → x% OFF on all items", () => {
    expect(
      buildListCardOfferLine({
        type: "PERCENTAGE",
        offerSubType: "ALL_ORDERS",
        discountPct: 25,
        discountVal: null,
        maxDiscount: null,
        minOrder: null,
        buyQty: null,
        getQty: null,
        menuItemIds: null,
        conditionsMode: "boost",
      })
    ).toBe("25% OFF on all items");
  });

  it("explicit Precision wins over item scope (checkout copy)", () => {
    expect(
      buildListCardOfferLine({
        type: "PERCENTAGE",
        offerSubType: "SPECIFIC_ITEM",
        discountPct: 25,
        discountVal: null,
        maxDiscount: null,
        minOrder: null,
        buyQty: null,
        getQty: null,
        menuItemIds: ["1"],
        conditionsMode: "precision",
      })
    ).toBe("25% OFF");
  });

  it("Precision with cap → upto", () => {
    expect(
      buildListCardOfferLine({
        type: "PERCENTAGE",
        offerSubType: "ALL_ORDERS",
        discountPct: 25,
        discountVal: null,
        maxDiscount: 100,
        minOrder: 249,
        buyQty: null,
        getQty: null,
        menuItemIds: null,
        conditionsMode: "precision",
      })
    ).toBe("25% OFF upto ₹100");
  });
});

describe("isSelectedItemBoostScope", () => {
  it("detects SPECIFIC_ITEM and menu ids", () => {
    expect(isSelectedItemBoostScope("SPECIFIC_ITEM", null)).toBe(true);
    expect(isSelectedItemBoostScope("ALL_ORDERS", ["1"])).toBe(true);
    expect(isSelectedItemBoostScope("ALL_ORDERS", null)).toBe(false);
  });
});
