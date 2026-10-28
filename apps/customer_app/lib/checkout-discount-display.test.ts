import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractFlashSaleDiscounts,
  flashSaleSavingsByOfferId,
  isFlashSaleDiscount,
  isCheckoutPromoDiscount,
  resolveCheckoutDiscountDisplayLabel,
  friendlyCheckoutDiscountLabel,
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

describe("resolveCheckoutDiscountDisplayLabel", () => {
  it("prefers platform offer name from catalog over billing label", () => {
    const label = resolveCheckoutDiscountDisplayLabel(
      {
        label: "Delivery discount · Free Delivery",
        amount: 70,
        meta: { platformOfferId: 12, offerKind: "FREE_DELIVERY" },
      },
      {
        platformOffers: [{ id: 12, name: "Free Delivery -- First Order" }],
      }
    );
    assert.equal(label, "Free Delivery -- First Order");
  });

  it("prefers merchant offer title over coupon code label", () => {
    const label = resolveCheckoutDiscountDisplayLabel(
      {
        label: "Coupon FLAT35OFF",
        amount: 35,
        meta: { merchantOfferId: 4, code: "FLAT35OFF" },
      },
      {
        merchantOffers: [
          { id: 4, title: "Flat ₹35 Off above ₹199", requiresCouponCode: "FLAT35OFF" },
        ],
      }
    );
    assert.equal(label, "Flat ₹35 Off above ₹199");
  });

  it("strips Coupon prefix when catalog miss", () => {
    assert.equal(friendlyCheckoutDiscountLabel("Coupon WELCOME50"), "WELCOME50");
  });
});
