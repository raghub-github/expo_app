import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyExclusiveCheckoutOffer } from "./checkoutExclusiveOffer.js";
import type {
  BillContext,
  BillingDataset,
  FeeRem,
  MerchantOfferRow,
  MutableBillState,
  PlatformOfferRow,
} from "./types.js";

function baseCtx(overrides: Partial<BillContext> = {}): BillContext {
  return {
    itemSubtotal: 500,
    addonSubtotal: 0,
    addonQtyTotal: 0,
    orderLines: [],
    distanceKm: 1,
    merchantStoreId: 42,
    merchantParentId: null,
    now: new Date("2026-07-12T12:00:00Z"),
    userType: "customer",
    userSegment: "ALL",
    couponCode: null,
    lineCategories: [],
    itemPackagingTotal: 0,
    packagingChargeAmount: 0,
    deliveryChargePerKm: 0,
    serviceType: "FOOD",
    cityName: null,
    dropPostalCode: "560001",
    dropGeoRefByLevel: {},
    platformOfferGeoBindingEffectiveIds: new Set(),
    checkoutCouponGeoBindingEffectiveIds: new Set(),
    deliveryFeeFromRateCard: 0,
    deliveryFeeFromGeo: null,
    deliveryDefaultBaseInr: 25,
    deliveryDefaultPerKmInr: 5,
    tipAmount: 0,
    donationAmount: 0,
    checkoutAudience: "CUSTOMER",
    subscriptionOptIn: false,
    selectedPlatformOfferId: null,
    selectedMerchantOfferId: null,
    forceNoAutoOffer: false,
    ...overrides,
  } as BillContext;
}

function emptyState(): MutableBillState {
  return {
    discountTotal: 0,
    deliveryFee: 0,
    platformFee: 0,
    packagingFee: 0,
    surgeFee: 0,
    smallOrderFee: 0,
    convenienceFee: 0,
    miscFee: 0,
    taxTotal: 0,
    appliedNonStackableDiscount: false,
    charges: [],
    discounts: [],
    taxes: [],
    breakdown_steps: [],
  };
}

function remFor(items: number): FeeRem {
  return {
    items,
    delivery: 40,
    platform: 5,
    packaging: 0,
    surge: 0,
    smallOrder: 0,
    convenience: 0,
    misc: 0,
  };
}

function datasetWith(
  merchantOffers: MerchantOfferRow[],
  platformOffers: PlatformOfferRow[] = []
): BillingDataset {
  return {
    rulesetVersion: 1,
    rules: [],
    deliverySlabs: [],
    packagingSlabs: [],
    deliveryRateCards: [],
    platformOffers,
    merchantOffers,
    taxConfigs: [],
    merchantOverrides: null,
    coupon: null,
  };
}

function merchantOffer(overrides: Partial<MerchantOfferRow> = {}): MerchantOfferRow {
  return {
    id: 1,
    offerId: "mo-1",
    title: "10% Off",
    offerType: "CART_PERCENTAGE",
    offerSubType: null,
    discountValue: null,
    discountPercentage: 10,
    maxDiscountAmount: null,
    minOrderAmount: null,
    maxOrderAmount: null,
    buyQuantity: null,
    getQuantity: null,
    couponCode: null,
    autoApply: true,
    isStackable: false,
    perOrderLimit: 0,
    firstOrderOnly: false,
    newUserOnly: false,
    maxUsesTotal: null,
    maxUsesPerUser: null,
    currentUses: 0,
    applicableOnDays: null,
    applicableTimeStart: null,
    applicableTimeEnd: null,
    maxDiscountPerOrder: null,
    metadata: {},
    displayPriority: 0,
    priority: 0,
    createdSourcePlatform: "partner",
    createdByRole: "merchant",
    approvalStatus: "approved",
    ...overrides,
  };
}

function platformOffer(overrides: Partial<PlatformOfferRow> = {}): PlatformOfferRow {
  return {
    id: 900,
    name: "Platform 15% Off",
    couponCode: "PLATFORM15",
    promoConfig: {},
    serviceType: "FOOD",
    discountType: "PERCENTAGE",
    valueNumeric: 15,
    deliveryDiscountType: null,
    deliveryDiscountValue: null,
    offerKind: "DISCOUNT",
    offerAudience: "CUSTOMER",
    fundingMode: "PLATFORM_ONLY",
    platformSharePct: 100,
    merchantSharePct: 0,
    maxPlatformContribution: null,
    maxMerchantContribution: null,
    targetScope: "GLOBAL",
    geoLevel: null,
    geoIds: [],
    merchantIds: [],
    customerSegment: "ALL",
    minOrderAmount: null,
    maxDiscountAmount: null,
    buyQty: null,
    getQty: null,
    isStackable: false,
    exclusionGroup: null,
    startsAt: null,
    endsAt: null,
    budgetTotal: null,
    budgetUsed: null,
    maxUsesTotal: null,
    maxUsesPerUser: null,
    maxUsesPerDay: null,
    maxUsesPerMonth: null,
    consumeMode: "ON_PLACED",
    restoreOnCancel: true,
    restoreOnRefund: true,
    priority: 0,
    isHidden: false,
    conditions: {},
    ...overrides,
  } as PlatformOfferRow;
}

function unexpectedCoupon(): never {
  throw new Error("coupon path should not be hit in these tests");
}

function merchantDiscountRows(state: MutableBillState) {
  return state.discounts.filter((d) => typeof d.meta?.merchantOfferId === "number");
}

function platformDiscountRows(state: MutableBillState) {
  return state.discounts.filter((d) => typeof d.meta?.platformOfferId === "number");
}

describe("applyExclusiveCheckoutOffer — auto-pick priority", () => {
  it("auto mode: platform-only eligible never auto-applies", () => {
    const ctx = baseCtx();
    const state = emptyState();
    const dataset = datasetWith([], [platformOffer({ id: 900 })]);
    applyExclusiveCheckoutOffer(ctx, dataset, state, 500, remFor(500), unexpectedCoupon);

    assert.equal(platformDiscountRows(state).length, 0);
    assert.equal(merchantDiscountRows(state).length, 0);
  });

  it("auto mode: eligible merchant Precision offer wins over eligible platform offer", () => {
    const ctx = baseCtx();
    const state = emptyState();
    const dataset = datasetWith(
      [merchantOffer({ id: 1 })],
      [platformOffer({ id: 900 })]
    );
    applyExclusiveCheckoutOffer(ctx, dataset, state, 500, remFor(500), unexpectedCoupon);

    assert.equal(merchantDiscountRows(state).length, 1);
    assert.equal(merchantDiscountRows(state)[0]!.meta?.merchantOfferId, 1);
    assert.equal(platformDiscountRows(state).length, 0);
  });

  it("previously-selected merchant offer now below min-order: re-picks another eligible merchant offer instead of going silent", () => {
    const ctx = baseCtx({ selectedMerchantOfferId: 1 });
    const state = emptyState();
    const dataset = datasetWith(
      [
        merchantOffer({ id: 1, minOrderAmount: 400 }), // no longer eligible at itemPlusAddon=300
        merchantOffer({ id: 2, minOrderAmount: null, discountPercentage: 5 }),
      ],
      [platformOffer({ id: 900 })]
    );
    applyExclusiveCheckoutOffer(ctx, dataset, state, 300, remFor(300), unexpectedCoupon);

    const merchantRows = merchantDiscountRows(state);
    assert.equal(merchantRows.length, 1);
    assert.equal(merchantRows[0]!.meta?.merchantOfferId, 2);
    assert.equal(platformDiscountRows(state).length, 0);
  });

  it("previously-selected merchant offer now ineligible and no other merchant offer qualifies: returns none, never falls back to platform", () => {
    const ctx = baseCtx({ selectedMerchantOfferId: 1 });
    const state = emptyState();
    const dataset = datasetWith(
      [merchantOffer({ id: 1, minOrderAmount: 400 })],
      [platformOffer({ id: 900 })]
    );
    applyExclusiveCheckoutOffer(ctx, dataset, state, 300, remFor(300), unexpectedCoupon);

    assert.equal(merchantDiscountRows(state).length, 0);
    assert.equal(platformDiscountRows(state).length, 0);
  });

  it("explicit selectedPlatformOfferId is always honored regardless of merchant offer eligibility", () => {
    const ctx = baseCtx({
      selectedPlatformOfferId: 900,
      platformOfferGeoBindingEffectiveIds: new Set([900]),
    checkoutCouponGeoBindingEffectiveIds: new Set([900]),
    });
    const state = emptyState();
    const dataset = datasetWith(
      [merchantOffer({ id: 1 })],
      [platformOffer({ id: 900 })]
    );
    applyExclusiveCheckoutOffer(ctx, dataset, state, 500, remFor(500), unexpectedCoupon);

    assert.equal(platformDiscountRows(state).length, 1);
    assert.equal(platformDiscountRows(state)[0]!.meta?.platformOfferId, 900);
    assert.equal(merchantDiscountRows(state).length, 0);
  });

  it("forceNoAutoOffer with nothing explicitly selected applies no cart-level promo", () => {
    const ctx = baseCtx({ forceNoAutoOffer: true });
    const state = emptyState();
    const dataset = datasetWith([merchantOffer({ id: 1 })], [platformOffer({ id: 900 })]);
    applyExclusiveCheckoutOffer(ctx, dataset, state, 500, remFor(500), unexpectedCoupon);

    assert.equal(merchantDiscountRows(state).length, 0);
    assert.equal(platformDiscountRows(state).length, 0);
  });

  it("auto mode: auto_apply coupon with higher savings wins over merchant Precision", () => {
    const ctx = baseCtx({
      checkoutCouponGeoBindingEffectiveIds: new Set([55]),
    });
    const state = emptyState();
    let appliedCouponId: number | null = null;
    const dataset = {
      ...datasetWith([merchantOffer({ id: 1, discountPercentage: 5 })]),
      autoApplyCoupons: [
        {
          id: 55,
          code: "AUTO50",
          discountType: "FIXED",
          valueNumeric: 50,
          maxDiscountCap: null,
          usageLimit: null,
          usedCount: 0,
          validFrom: null,
          validUntil: null,
          isActive: true,
          isHidden: false,
          serviceType: "FOOD",
          offerAudience: "CUSTOMER",
          perUserUsageLimit: null,
          metadata: null,
          couponConfig: { auto_apply: true, priority: 10 },
        },
      ],
    };
    applyExclusiveCheckoutOffer(ctx, dataset, state, 500, remFor(500), (_c, coupon) => {
      appliedCouponId = coupon.id;
      state.discounts.push({
        kind: "discount",
        label: `Coupon ${coupon.code}`,
        amount: 50,
        hidden: false,
        meta: { couponId: coupon.id, code: coupon.code },
      });
    });

    assert.equal(appliedCouponId, 55);
    assert.equal(merchantDiscountRows(state).length, 0);
    assert.equal(state.discounts.some((d) => d.meta?.code === "AUTO50"), true);
  });
});

/**
 * Mixed-cart per-line offer classification (reproduces prod order GM10000199 / core 63).
 * A cart-level PRECISION offer applied AFTER item-surface BOGO/Boost must NOT overwrite the BOGO
 * item's own line — every order line's offer type is isolated. Before the fix, precision's
 * proportional share relabeled the (zero-discount) BOGO line to PERCENTAGE, so it persisted as NONE.
 */
describe("applyExclusiveCheckoutOffer — mixed cart isolates each line's offer type (BOOST + BOGO + NONE + precision)", () => {
  const boost = (id: number, items: string[]): MerchantOfferRow =>
    merchantOffer({
      id, offerType: "PERCENTAGE", discountPercentage: 15, isStackable: false,
      metadata: { conditions_mode: "boost", menu_item_ids: items },
    });
  const bogo = (id: number, items: string[]): MerchantOfferRow =>
    merchantOffer({
      id, offerType: "BUY_X_GET_Y", discountPercentage: null, buyQuantity: 1, getQuantity: 1,
      isStackable: false, metadata: { conditions_mode: "bogo", menu_item_ids: items },
    });
  const precision = (id: number): MerchantOfferRow =>
    merchantOffer({
      id, offerType: "PERCENTAGE", discountPercentage: 20, maxDiscountAmount: 80, isStackable: false,
      metadata: { conditions_mode: "precision" }, // ALL_ORDERS: no menu_item_ids
    });

  // Lines with eligibility already marked (as the pipeline does before offers run):
  // Boost + BOGO items are ITEM_PROMO (discountEligible=false); plain items are eligible.
  const mixedCartCtx = () =>
    baseCtx({
      orderLines: [
        { menuItemId: "70", lineTotal: 176, quantity: 1, discountEligible: false, ineligibilityReason: "ITEM_PROMO" }, // BOOST
        { menuItemId: "25", lineTotal: 71, quantity: 1, discountEligible: false, ineligibilityReason: "ITEM_PROMO" },  // BOGO
        { menuItemId: "24", lineTotal: 53, quantity: 1, discountEligible: true },  // NONE (precision-eligible)
        { menuItemId: "91", lineTotal: 220, quantity: 1, discountEligible: true }, // NONE (precision-eligible)
      ],
    } as Partial<BillContext>);

  const lineByMenu = (ctx: BillContext, menu: string) =>
    (ctx.orderLines ?? []).find((l) => String(l.menuItemId) === menu)!;
  const norm = (t: unknown) => String(t ?? "").toUpperCase().replace(/[-\s]+/g, "_");

  it("the BOGO item stays BOGO — precision never overwrites it to NONE", () => {
    const ctx = mixedCartCtx();
    const state = emptyState();
    const dataset = datasetWith([boost(19, ["70"]), bogo(18, ["25"]), precision(17)]);
    applyExclusiveCheckoutOffer(ctx, dataset, state, 520, remFor(520), unexpectedCoupon);

    // BOGO item keeps its own item offer (id 18), disc 0, net = gross.
    const bogoLine = lineByMenu(ctx, "25");
    assert.equal(norm(bogoLine.appliedOfferType), "BUY_X_GET_Y", "menu 25 must remain a BOGO line");
    assert.equal(Math.floor(Number(bogoLine.appliedOfferId)), 18);
    assert.equal(bogoLine.offerDiscountAmount ?? 0, 0);
    assert.equal(bogoLine.effectiveLineTotal ?? bogoLine.lineTotal, bogoLine.lineTotal);

    // Boost item keeps its Boost (id 19) with a real discount.
    const boostLine = lineByMenu(ctx, "70");
    assert.equal(norm(boostLine.appliedOfferType), "PERCENTAGE");
    assert.equal(Math.floor(Number(boostLine.appliedOfferId)), 19);
    assert.ok((boostLine.offerDiscountAmount ?? 0) > 0);

    // Precision only ever lands on the plain eligible lines, never the BOGO/Boost lines.
    assert.notEqual(Math.floor(Number(lineByMenu(ctx, "25").appliedOfferId)), 17);
    assert.notEqual(Math.floor(Number(lineByMenu(ctx, "70").appliedOfferId)), 17);
  });

  it("scenario matrix — BOGO classification is identical with/without the extra NONE line", () => {
    // Without NONE lines (scenario 3) the BOGO already worked; assert scenario 4 matches it.
    const run = (lines: NonNullable<BillContext["orderLines"]>) => {
      const ctx = baseCtx({ orderLines: lines } as Partial<BillContext>);
      const state = emptyState();
      const dataset = datasetWith([boost(19, ["70"]), bogo(18, ["25"]), precision(17)]);
      applyExclusiveCheckoutOffer(ctx, dataset, state, lines.reduce((s, l) => s + l.lineTotal, 0), remFor(520), unexpectedCoupon);
      return norm(lineByMenu(ctx, "25").appliedOfferType);
    };
    const scenario3 = run([
      { menuItemId: "70", lineTotal: 176, quantity: 1, discountEligible: false, ineligibilityReason: "ITEM_PROMO" },
      { menuItemId: "25", lineTotal: 71, quantity: 1, discountEligible: false, ineligibilityReason: "ITEM_PROMO" },
    ]);
    const scenario4 = run([
      { menuItemId: "70", lineTotal: 176, quantity: 1, discountEligible: false, ineligibilityReason: "ITEM_PROMO" },
      { menuItemId: "25", lineTotal: 71, quantity: 1, discountEligible: false, ineligibilityReason: "ITEM_PROMO" },
      { menuItemId: "24", lineTotal: 53, quantity: 1, discountEligible: true },
      { menuItemId: "91", lineTotal: 220, quantity: 1, discountEligible: true },
    ]);
    assert.equal(scenario3, "BUY_X_GET_Y");
    assert.equal(scenario4, "BUY_X_GET_Y");
    assert.equal(scenario3, scenario4); // cart composition must not change the BOGO classification
  });
});
