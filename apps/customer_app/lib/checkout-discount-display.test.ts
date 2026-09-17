import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractFlashSaleDiscounts,
  flashSaleSavingsByOfferId,
  isFlashSaleDiscount,
  isCheckoutPromoDiscount,
} from "./checkout-discount-display";

describe("flash sale checkout display helpers", () => {
  it("detects hidden FLASH_SALE subsidy lines", () => {
    const flash = {
      label: "Flash Sale",
      amount: 58,
      hidden: true,
      meta: { flashSale: true, platformOfferId: 7, offerKind: "FLASH_SALE" },
    };
    assert.equal(isFlashSaleDiscount(flash), true);
    assert.equal(isCheckoutPromoDiscount(flash), false);
    assert.deepEqual(extractFlashSaleDiscounts([flash]).map((d) => d.amount), [58]);
    assert.deepEqual(flashSaleSavingsByOfferId([flash]), { 7: 58 });
  });

  it("ignores non-flash discounts", () => {
    const promo = {
      label: "Flat ₹35 Off",
      amount: 35,
      hidden: false,
      meta: { platformOfferId: 9, offerKind: "DISCOUNT" },
    };
    assert.equal(isFlashSaleDiscount(promo), false);
    assert.equal(isCheckoutPromoDiscount(promo), true);
    assert.deepEqual(flashSaleSavingsByOfferId([promo]), {});
  });
});
