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
