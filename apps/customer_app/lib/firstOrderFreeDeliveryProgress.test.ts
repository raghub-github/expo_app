import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildFreeDeliveryUnlockCompensation,
  findPlatformFreeDeliveryOffer,
  formatAddMoreForFreeDelivery,
  isPlatformFreeDeliveryOffer,
  resolveFreeDeliveryProgress,
} from "./firstOrderFreeDeliveryProgress";

describe("isPlatformFreeDeliveryOffer", () => {
  it("matches Super Admin FREE_DELIVERY kind only", () => {
    assert.equal(isPlatformFreeDeliveryOffer({ offerKind: "FREE_DELIVERY" }), true);
    assert.equal(isPlatformFreeDeliveryOffer({ offerKind: "free-delivery" }), true);
    assert.equal(isPlatformFreeDeliveryOffer({ offerKind: "CART_FLAT" }), false);
  });
});

describe("resolveFreeDeliveryProgress", () => {
  const offer = {
    id: 3,
    name: "First Bite, Free Delivery",
    offerKind: "FREE_DELIVERY",
    summary: "Min order ₹149",
    minCartAmount: 149,
    estimatedSavingsInr: 74.31,
  };

  it("hides Plus path while FREE_DELIVERY is listed below min cart", () => {
    const p = resolveFreeDeliveryProgress({
      platformOffersIneligible: [offer],
      cartSubtotal: 100,
      freeDeliveryAlreadyOnBill: false,
    });
    assert.equal(p.offerAvailable, true);
    assert.equal(p.gapInr, 49);
    assert.equal(formatAddMoreForFreeDelivery(p.gapInr), "Add ₹49 more to avail free delivery");
  });

  it("gap is 0 when free delivery is already on the bill", () => {
    const p = resolveFreeDeliveryProgress({
      platformOffers: [offer],
      cartSubtotal: 50,
      freeDeliveryAlreadyOnBill: true,
    });
    assert.equal(p.offerAvailable, true);
    assert.equal(p.gapInr, 0);
  });

  it("offer unavailable when not listed and not on bill — Plus may return", () => {
    const p = resolveFreeDeliveryProgress({
      platformOffers: [],
      platformOffersIneligible: [],
      cartSubtotal: 200,
      freeDeliveryAlreadyOnBill: false,
    });
    assert.equal(p.offerAvailable, false);
    assert.equal(findPlatformFreeDeliveryOffer({}), null);
  });

  it("builds unlock sheet compensation for ADD button", () => {
    const comp = buildFreeDeliveryUnlockCompensation({
      offer,
      gapInr: 18,
      merchantId: "GMMC1026",
      deliverySavingsInr: 74.31,
    });
    assert.ok(comp);
    assert.equal(comp!.offerKind, "FREE_DELIVERY");
    assert.equal(comp!.amountInr, 18);
    assert.equal(comp!.offerSavingsInr, 74.31);
    assert.equal(comp!.offerSource, "platform");
    assert.equal(comp!.offerId, 3);
  });

  it("does not use the GatiCash gap as You save when delivery quote is missing", () => {
    const comp = buildFreeDeliveryUnlockCompensation({
      offer,
      gapInr: 18,
      merchantId: "GMMC1026",
      deliverySavingsInr: 0,
    });
    assert.ok(comp);
    assert.equal(comp!.amountInr, 18);
    assert.equal(comp!.offerSavingsInr, 74.31);
  });
});

describe("free delivery You-save amount", () => {
  // Production shape of platform offer 9 "First Bite, Free Delivery":
  // delivery_discount_type = FULL_WAIVE, delivery_discount_value = NULL, so the
  // backend reports estimatedSavingsInr = null and only the live bill knows the fee.
  const fullWaiveOffer = {
    id: 9,
    name: "First Bite, Free Delivery",
    offerKind: "FREE_DELIVERY",
    minCartAmount: 99,
    estimatedSavingsInr: null,
  };

  it("uses the quoted delivery fee as You save for a FULL_WAIVE offer", () => {
    const comp = buildFreeDeliveryUnlockCompensation({
      offer: fullWaiveOffer,
      gapInr: 18,
      merchantId: "GMMC1026",
      deliverySavingsInr: 29,
    });
    assert.ok(comp);
    // You save = fee waived; GatiCash = min-cart top-up. They are different numbers.
    assert.equal(comp!.offerSavingsInr, 29);
    assert.equal(comp!.amountInr, 18);
    assert.notEqual(comp!.offerSavingsInr, comp!.amountInr);
  });

  it("never equals the GatiCash top-up just because the fee happens to match", () => {
    const comp = buildFreeDeliveryUnlockCompensation({
      offer: fullWaiveOffer,
      gapInr: 18,
      merchantId: "GMMC1026",
      deliverySavingsInr: 18,
    });
    // Same ₹18 on both chips is legitimate here — it is the real fee, not the gap.
    assert.equal(comp!.offerSavingsInr, 18);
    assert.equal(comp!.amountInr, 18);
  });

  it("omits the savings clause while the bill has not quoted a fee", () => {
    const comp = buildFreeDeliveryUnlockCompensation({
      offer: fullWaiveOffer,
      gapInr: 18,
      merchantId: "GMMC1026",
      deliverySavingsInr: 0,
    });
    assert.ok(comp);
    assert.equal(comp!.offerSavingsInr, 0);
    assert.equal(comp!.subline, "You're ₹18 away");
    assert.ok(!comp!.subline.includes("₹0"));
  });

  it("keeps whole rupees whole and paise exact in the savings clause", () => {
    const comp = buildFreeDeliveryUnlockCompensation({
      offer: fullWaiveOffer,
      gapInr: 18,
      merchantId: "GMMC1026",
      deliverySavingsInr: 29.5,
    });
    assert.equal(comp!.subline, "You're ₹18 away · save ₹29.50 on delivery");
  });
});
