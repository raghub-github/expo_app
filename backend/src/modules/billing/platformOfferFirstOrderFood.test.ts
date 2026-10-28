import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BillContext, PlatformOfferRow } from "./types.js";
import {
  FIRST_ORDER_FREE_DELIVERY_BENEFIT_FAMILY,
  firstOrderFreeDeliveryIneligibilityReason,
  platformOfferFirstOrderBenefitFamily,
  platformOfferFirstOrderFreeDeliveryPasses,
  platformOfferRequiresFirstOrderFreeDelivery,
} from "./platformOfferFirstOrderFood.js";

function offer(partial: Partial<PlatformOfferRow> & { offerKind?: string }): PlatformOfferRow {
  return {
    id: 1,
    name: "Free Delivery -- First Order",
    offerKind: "FREE_DELIVERY",
    customerSegment: "NEW",
    serviceType: "FOOD",
    discountType: "FIXED",
    valueNumeric: 0,
    priority: 0,
    isActive: true,
    isHidden: false,
    fundingMode: "PLATFORM",
    platformSharePct: 100,
    merchantSharePct: 0,
    startsAt: null,
    endsAt: null,
    minOrderAmount: 99,
    maxDiscountAmount: null,
    maxUsesTotal: null,
    maxUsesPerUser: 1,
    maxUsesPerDay: null,
    maxUsesPerMonth: null,
    budgetTotal: 1500,
    budgetUsed: 0,
    deliveryDiscountType: "FULL_WAIVE",
    deliveryDiscountValue: null,
    couponCode: "FIRSTDELIVERY",
    offerAudience: "CUSTOMER",
    targetScope: "GLOBAL",
    geoLevel: null,
    geoIds: [],
    merchantIds: [],
    conditions: {},
    promoConfig: { auto_apply: true },
    consumeMode: "ON_PLACED",
    restoreOnCancel: false,
    restoreOnRefund: false,
    isStackable: false,
    exclusionGroup: null,
    buyQty: null,
    getQty: null,
    ...partial,
  } as PlatformOfferRow;
}

function ctx(partial: Partial<BillContext> = {}): BillContext {
  return {
    itemSubtotal: 200,
    addonSubtotal: 0,
    addonQtyTotal: 0,
    orderLines: [],
    distanceKm: 3,
    merchantStoreId: 1,
    merchantParentId: null,
    now: new Date(),
    userType: "customer",
    userSegment: "NEW",
    couponCode: null,
    lineCategories: [],
    itemPackagingTotal: 0,
    packagingChargeAmount: 0,
    deliveryChargePerKm: 10,
    serviceType: "FOOD",
    completedFoodOrderCount: 0,
    firstOrderFreeDeliveryUsageCount: 0,
    ...partial,
  } as BillContext;
}

describe("platformOfferRequiresFirstOrderFreeDelivery", () => {
  it("detects FREE_DELIVERY + NEW", () => {
    assert.equal(platformOfferRequiresFirstOrderFreeDelivery(offer({})), true);
  });

  it("detects explicit first_order_only", () => {
    assert.equal(
      platformOfferRequiresFirstOrderFreeDelivery(
        offer({ offerKind: "DISCOUNT", customerSegment: "ALL", conditions: { first_order_only: true } })
      ),
      true
    );
  });

  it("ignores unrelated FREE_DELIVERY ALL segment without flags", () => {
    assert.equal(
      platformOfferRequiresFirstOrderFreeDelivery(offer({ customerSegment: "ALL", conditions: {} })),
      false
    );
  });
});

describe("platformOfferFirstOrderFreeDeliveryPasses", () => {
  it("allows eligible new FOOD customer", () => {
    assert.equal(platformOfferFirstOrderFreeDeliveryPasses(ctx(), offer({})), true);
  });

  it("blocks grocery / ride service", () => {
    assert.equal(
      platformOfferFirstOrderFreeDeliveryPasses(ctx({ serviceType: "GROCERY" }), offer({})),
      false
    );
    assert.equal(
      platformOfferFirstOrderFreeDeliveryPasses(ctx({ serviceType: "RIDE" }), offer({})),
      false
    );
  });

  it("blocks when customer has a delivered food order", () => {
    assert.equal(
      platformOfferFirstOrderFreeDeliveryPasses(ctx({ completedFoodOrderCount: 1 }), offer({})),
      false
    );
  });

  it("blocks when benefit family already redeemed", () => {
    assert.equal(
      platformOfferFirstOrderFreeDeliveryPasses(
        ctx({ firstOrderFreeDeliveryUsageCount: 1 }),
        offer({})
      ),
      false
    );
  });

  it("fails closed when history unknown", () => {
    assert.equal(
      platformOfferFirstOrderFreeDeliveryPasses(
        ctx({ completedFoodOrderCount: null, firstOrderFreeDeliveryUsageCount: 0 }),
        offer({})
      ),
      false
    );
  });
});

describe("platformOfferFirstOrderBenefitFamily", () => {
  it("returns shared family key", () => {
    assert.equal(
      platformOfferFirstOrderBenefitFamily(offer({})),
      FIRST_ORDER_FREE_DELIVERY_BENEFIT_FAMILY
    );
  });
});

describe("firstOrderFreeDeliveryIneligibilityReason", () => {
  it("explains prior redemption", () => {
    const why = firstOrderFreeDeliveryIneligibilityReason(
      ctx({ firstOrderFreeDeliveryUsageCount: 1 }),
      offer({})
    );
    assert.equal(why, "first_order_free_delivery=benefit_already_redeemed");
  });
});
