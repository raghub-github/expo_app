import test from "node:test";
import assert from "node:assert/strict";
import {
  computeSubscriptionDeliveryBenefit,
  isSubscriptionDeliveryBenefitEligible,
} from "./subscriptionDeliveryPricing.js";
import type { DeliveryRateSlabRow } from "../delivery-slab-pricing/types.js";

function productSpecSlabs(): DeliveryRateSlabRow[] {
  return [
    {
      id: 1,
      geoLevel: "pincode",
      geoRefId: "pc-1",
      serviceType: "food",
      actorType: "customer",
      minKm: 0,
      maxKm: 3,
      baseFare: 25,
      perKmRate: 0,
      minCharge: null,
      priority: 100,
      isActive: true,
    },
    {
      id: 2,
      geoLevel: "pincode",
      geoRefId: "pc-1",
      serviceType: "food",
      actorType: "customer",
      minKm: 3,
      maxKm: 10,
      baseFare: null,
      perKmRate: 6,
      minCharge: null,
      priority: 100,
      isActive: true,
    },
  ];
}

test("isSubscriptionDeliveryBenefitEligible — true when distance known", () => {
  assert.equal(
    isSubscriptionDeliveryBenefitEligible({
      freeDeliveryEnabled: true,
      distanceKm: 12,
    }),
    true
  );
  assert.equal(
    isSubscriptionDeliveryBenefitEligible({
      freeDeliveryEnabled: true,
      distanceKm: 12,
      isSelfPickup: true,
    }),
    false
  );
});

test("full waiver within membership radius", () => {
  const res = computeSubscriptionDeliveryBenefit({
    distanceKm: 5,
    coveredRadiusKm: 5,
    fullDeliveryFeeInr: 37,
    pricing: { pricingEngine: "slab_geo", progressiveSlabs: productSpecSlabs() },
  });
  assert.ok(res);
  assert.equal(res!.membershipDeliveryFeeInr, 0);
  assert.equal(res!.waivedInr, 37);
  assert.equal(res!.isFullWaiver, true);
});

test("partial waiver beyond radius — 7 km trip, 5 km covered", () => {
  const fullDeliveryFeeInr = 49; // 25 + (7-3)*6
  const res = computeSubscriptionDeliveryBenefit({
    distanceKm: 7,
    coveredRadiusKm: 5,
    fullDeliveryFeeInr,
    pricing: { pricingEngine: "slab_geo", progressiveSlabs: productSpecSlabs() },
  });
  assert.ok(res);
  assert.equal(res!.membershipDeliveryFeeInr, 37); // base 25 + excess (49-37)
  assert.equal(res!.waivedInr, 12);
  assert.equal(res!.isPartial, true);
  assert.equal(res!.excessDistanceKm, 2);
});

test("fallback per-km — charges base + excess km only", () => {
  const res = computeSubscriptionDeliveryBenefit({
    distanceKm: 7,
    coveredRadiusKm: 5,
    fullDeliveryFeeInr: 60, // base 25 + 7*5
    pricing: {
      pricingEngine: "fallback_per_km",
      fallbackRates: { baseInr: 25, perKmInr: 5, minFeeInr: 0 },
    },
  });
  assert.ok(res);
  assert.equal(res!.membershipDeliveryFeeInr, 35); // 25 + (60-50)
  assert.equal(res!.waivedInr, 25);
});

test("never returns negative payable delivery", () => {
  const res = computeSubscriptionDeliveryBenefit({
    distanceKm: 7,
    coveredRadiusKm: 5,
    fullDeliveryFeeInr: 10,
    pricing: { pricingEngine: "slab_geo", progressiveSlabs: productSpecSlabs() },
  });
  assert.ok(res);
  assert.ok(res!.membershipDeliveryFeeInr >= 0);
  assert.ok(res!.waivedInr >= 0);
  assert.equal(res!.membershipDeliveryFeeInr + res!.waivedInr, 10);
});
