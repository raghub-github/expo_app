import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeFlatAmountOfferTitle,
  platformOfferCheckoutDisplayName,
} from "./platformOfferDisplayName.js";

describe("platformOfferCheckoutDisplayName", () => {
  it("FREE_DELIVERY uses Offer name, not leftover FIXED value", () => {
    const title = platformOfferCheckoutDisplayName({
      name: "Free Delivery -- First Order",
      offerKind: "FREE_DELIVERY",
      discountType: "FIXED",
      valueNumeric: 35,
      maxDiscountAmount: null,
    });
    assert.equal(title, "Free Delivery -- First Order");
  });

  it("FREE_DELIVERY falls back when name empty", () => {
    assert.equal(
      platformOfferCheckoutDisplayName({
        name: null,
        offerKind: "FREE_DELIVERY",
        discountType: "FIXED",
        valueNumeric: 35,
        maxDiscountAmount: null,
      }),
      "Free Delivery"
    );
  });

  it("cart FIXED still formats Flat ₹N Off", () => {
    assert.equal(
      platformOfferCheckoutDisplayName({
        name: "Welcome",
        offerKind: "DISCOUNT",
        discountType: "FIXED",
        valueNumeric: 35,
        maxDiscountAmount: null,
      }),
      "Flat ₹35 Off"
    );
  });

  it("normalizeFlatAmountOfferTitle keeps ₹ titles", () => {
    assert.equal(normalizeFlatAmountOfferTitle("Flat ₹35 Off above ₹199"), "Flat ₹35 Off above ₹199");
  });
});
