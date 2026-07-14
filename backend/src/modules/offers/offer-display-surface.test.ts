import { describe, expect, it } from "vitest";
import {
  resolveOfferDisplaySurface,
  parseMenuItemIdsFromMeta,
  parseConditionsModeFromMeta,
} from "./offer-display-surface.js";

describe("resolveOfferDisplaySurface", () => {
  it("routes BOGO to item", () => {
    expect(
      resolveOfferDisplaySurface({
        offerType: "BUY_X_GET_Y",
        menuItemIds: ["a"],
        conditionsMode: "boost",
      })
    ).toBe("item");
  });

  it("routes Boost on specific items to item", () => {
    expect(
      resolveOfferDisplaySurface({
        offerType: "PERCENTAGE",
        offerSubType: "SPECIFIC_ITEM",
        menuItemIds: ["a", "b"],
        conditionsMode: "boost",
      })
    ).toBe("item");
  });

  it("routes Precision to sheet", () => {
    expect(
      resolveOfferDisplaySurface({
        offerType: "PERCENTAGE",
        offerSubType: "ALL_ORDERS",
        menuItemIds: null,
        conditionsMode: "precision",
      })
    ).toBe("sheet");
  });

  it("routes cart / free delivery / coupon to sheet", () => {
    expect(resolveOfferDisplaySurface({ offerType: "CART_PERCENTAGE" })).toBe("sheet");
    expect(resolveOfferDisplaySurface({ offerType: "FREE_DELIVERY" })).toBe("sheet");
    expect(resolveOfferDisplaySurface({ offerType: "COUPON" })).toBe("sheet");
  });

  it("routes Boost ALL_ORDERS to both", () => {
    expect(
      resolveOfferDisplaySurface({
        offerType: "PERCENTAGE",
        offerSubType: "ALL_ORDERS",
        menuItemIds: null,
        conditionsMode: "boost",
      })
    ).toBe("both");
  });

  it("routes legacy store-wide % (no mode) to both", () => {
    expect(
      resolveOfferDisplaySurface({
        offerType: "PERCENTAGE",
        offerSubType: "ALL_ORDERS",
        menuItemIds: null,
        conditionsMode: null,
      })
    ).toBe("both");
  });
});

describe("metadata parsers", () => {
  it("parses conditions_mode and menu_item_ids", () => {
    const meta = { conditions_mode: "boost", menu_item_ids: ["x", "y"] };
    expect(parseConditionsModeFromMeta(meta)).toBe("boost");
    expect(parseMenuItemIdsFromMeta(meta)).toEqual(["x", "y"]);
  });

  it("prefers create_path over conditions_mode", () => {
    expect(
      parseConditionsModeFromMeta({ create_path: "precision", conditions_mode: "boost" })
    ).toBe("precision");
  });
});
