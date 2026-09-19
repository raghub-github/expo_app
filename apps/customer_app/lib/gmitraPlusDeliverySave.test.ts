import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isMembershipDeliveryUpsellEligible,
  resolveGmitraPlusDeliverySave,
  resolveMembershipDeliverySavingsDisplay,
} from "./gmitraPlusDeliverySave.ts";

describe("isMembershipDeliveryUpsellEligible", () => {
  it("is true only within free-delivery radius", () => {
    assert.equal(
      isMembershipDeliveryUpsellEligible({
        deliveryType: "delivery",
        freeDeliveryEnabled: true,
        distanceKm: 4.2,
        maxFreeDeliveryRadiusKm: 7,
      }),
      true
    );
    assert.equal(
      isMembershipDeliveryUpsellEligible({
        deliveryType: "delivery",
        freeDeliveryEnabled: true,
        distanceKm: 9.5,
        maxFreeDeliveryRadiusKm: 7,
      }),
      false
    );
  });
});

describe("resolveGmitraPlusDeliverySave", () => {
  it("returns null beyond membership radius (no partial upsell)", () => {
    const save = resolveGmitraPlusDeliverySave({
      deliveryType: "delivery",
      freeDeliveryEnabled: true,
      maxFreeDeliveryRadiusKm: 7,
      distanceKm: 12,
      deliveryFeeQuotedInr: 80,
      deliveryFeeStrikeAmount: 80,
      currentDeliveryFee: 80,
      serverBenefit: { waivedInr: 51.66, isPartial: true },
    });
    assert.equal(save, null);
  });

  it("uses exact server waived amount within radius", () => {
    const save = resolveGmitraPlusDeliverySave({
      deliveryType: "delivery",
      freeDeliveryEnabled: true,
      maxFreeDeliveryRadiusKm: 7,
      distanceKm: 3,
      deliveryFeeQuotedInr: 60,
      deliveryFeeStrikeAmount: 60,
      currentDeliveryFee: 60,
      serverBenefit: { waivedInr: 60, isPartial: false },
    });
    assert.equal(save, 60);
  });

  it("falls back to quoted fee within radius when no server benefit", () => {
    const save = resolveGmitraPlusDeliverySave({
      deliveryType: "delivery",
      freeDeliveryEnabled: true,
      maxFreeDeliveryRadiusKm: 7,
      distanceKm: 2,
      deliveryFeeQuotedInr: 45.5,
      deliveryFeeStrikeAmount: null,
      currentDeliveryFee: 45.5,
      serverBenefit: null,
    });
    assert.equal(save, 45.5);
  });
});

describe("resolveMembershipDeliverySavingsDisplay", () => {
  it("keeps applied bill savings even when outside radius", () => {
    const save = resolveMembershipDeliverySavingsDisplay({
      deliveryType: "delivery",
      freeDeliveryEnabled: true,
      maxFreeDeliveryRadiusKm: 7,
      distanceKm: 15,
      deliveryFeeQuotedInr: 90,
      deliveryFeeStrikeAmount: 90,
      currentDeliveryFee: 40,
      serverBenefit: { waivedInr: 50, isPartial: true },
      appliedBillSavings: 50,
      membershipOnBill: true,
    });
    assert.equal(save, 50);
  });
});
