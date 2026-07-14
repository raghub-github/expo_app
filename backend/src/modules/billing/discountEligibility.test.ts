import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  markOrderLinesDiscountEligibility,
  promoEligibleSubtotal,
  isItemSurfaceMerchantOffer,
  menuIdAliases,
} from "./discountEligibility.js";
import { applyPlatformCartOffers } from "./platformOffersApply.js";
import type {
  BillContext,
  BillingDataset,
  FeeRem,
  MerchantOfferRow,
  MutableBillState,
  PlatformOfferRow,
} from "./types.js";

/**
 * Regression for the cross-item offer-bleed bug (order GM10000194 / core 58): an opaque store
 * item id like "HC77_d408a86767dbd6e1" was split on "_" into the bare store prefix "HC77" and
 * emitted as a matching alias. Since every item at store 77 has an "HC77_*" id, ANY offer that
 * listed even one "HC77_*" item alias-matched EVERY item in the store — so a BOGO on item A was
 * attributed to unrelated Boost item B (and frozen into CTM as BOGO). "_" must only split a
 * NUMERIC menu-id prefix ("102_half" → "102"); a hash/ULID id is opaque and never split.
 */
describe("menuIdAliases — opaque store item ids never alias to a shared store prefix", () => {
  it('"HC77_<hash>" does NOT emit the bare "HC77" store prefix', () => {
    const aliases = menuIdAliases("HC77_d408a86767dbd6e1");
    assert.deepEqual(aliases, ["HC77_d408a86767dbd6e1"]);
    assert.ok(!aliases.includes("HC77"));
  });

  it("two different HC77_* items never share an alias (no cross-item match)", () => {
    const a = new Set(menuIdAliases("HC77_d408a86767dbd6e1")); // a Boost item
    const b = menuIdAliases("HC77_9527127d85695a69"); // a BOGO item
    assert.ok(!b.some((x) => a.has(x)), "distinct store items must not alias-collide");
  });

  it("a genuine BOGO item still matches its own id exactly", () => {
    const allow = new Set(menuIdAliases("01KMNH5JQCJ9M2CASFD1JRXS9W"));
    assert.ok(menuIdAliases("01KMNH5JQCJ9M2CASFD1JRXS9W").some((x) => allow.has(x)));
  });

  it("a NUMERIC composite id still splits ('102_half' → '102')", () => {
    const aliases = menuIdAliases("102_half");
    assert.ok(aliases.includes("102"));
    assert.ok(aliases.includes("102_half"));
  });

  it("'::' variant separator still yields the base menu id", () => {
    assert.ok(menuIdAliases("102::regular").includes("102"));
  });
});

function baseCtx(overrides: Partial<BillContext> = {}): BillContext {
  return {
    itemSubtotal: 590,
    addonSubtotal: 0,
    addonQtyTotal: 0,
    orderLines: [],
    distanceKm: 1,
    merchantStoreId: 42,
    merchantParentId: null,
    now: new Date("2026-07-11T12:00:00Z"),
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
    deliveryFeeFromRateCard: 0,
    deliveryFeeFromGeo: null,
    deliveryDefaultBaseInr: 25,
    deliveryDefaultPerKmInr: 5,
    ...overrides,
  };
}

function boostOffer(menuItemIds: string[]): MerchantOfferRow {
  return {
    id: 1,
    storeId: 42,
    title: "15% OFF",
    offerType: "PERCENTAGE",
    discountPercentage: 15,
    discountValue: null,
    maxDiscountAmount: null,
    maxDiscountPerOrder: null,
    minOrderAmount: null,
    buyQuantity: null,
    getQuantity: null,
    couponCode: null,
    autoApply: true,
    isStackable: true,
    displayPriority: 1,
    firstOrderOnly: false,
    newUserOnly: false,
    maxUsesPerUser: null,
    applicableOnDays: null,
    applicableTimeStart: null,
    applicableTimeEnd: null,
    metadata: { conditions_mode: "boost", menu_item_ids: menuItemIds },
  } as MerchantOfferRow;
}

describe("discountEligibility", () => {
  it("marks Boost-targeted and MRP lines as not discount-eligible", () => {
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "A", lineTotal: 300, quantity: 1 },
        { menuItemId: "B", lineTotal: 200, quantity: 1 },
        { menuItemId: "C", lineTotal: 150, quantity: 1 },
        { menuItemId: "D", lineTotal: 100, quantity: 1 },
      ],
      {
        mrpIneligibleIds: new Set(["D"]),
        merchantOffers: [boostOffer(["A"])],
        now: new Date("2026-07-11T12:00:00Z"),
      }
    );
    assert.equal(lines.find((l) => l.menuItemId === "A")?.discountEligible, false);
    assert.equal(lines.find((l) => l.menuItemId === "B")?.discountEligible, true);
    assert.equal(lines.find((l) => l.menuItemId === "C")?.discountEligible, true);
    assert.equal(lines.find((l) => l.menuItemId === "D")?.discountEligible, false);
  });

  it("promoEligibleSubtotal excludes already-discounted lines (coupon base example)", () => {
    const ctx = baseCtx({
      orderLines: [
        { menuItemId: "A", lineTotal: 240, quantity: 1, discountEligible: false },
        { menuItemId: "B", lineTotal: 200, quantity: 1, discountEligible: true },
        { menuItemId: "C", lineTotal: 150, quantity: 1, discountEligible: true },
      ],
    });
    assert.equal(promoEligibleSubtotal(ctx), 350);
    const couponAmt = (promoEligibleSubtotal(ctx) * 20) / 100;
    assert.equal(couponAmt, 70);
  });

  it("MRP-only line is excluded from coupon base without Boost", () => {
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "1", lineTotal: 180, quantity: 1 },
        { menuItemId: "2", lineTotal: 220, quantity: 1 },
      ],
      {
        mrpIneligibleIds: new Set(["1"]),
        merchantOffers: [],
        now: new Date(),
      }
    );
    const ctx = baseCtx({ orderLines: lines });
    assert.equal(promoEligibleSubtotal(ctx), 220);
  });

  it("ignores client hints — server MRP + item-surface only", () => {
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "10", lineTotal: 150, quantity: 1 },
        { menuItemId: "20", lineTotal: 71, quantity: 1 },
        { menuItemId: "30", lineTotal: 188, quantity: 1 },
      ],
      {
        mrpIneligibleIds: new Set(),
        merchantOffers: [boostOffer(["10"])],
        now: new Date(),
      }
    );
    assert.equal(lines.find((l) => l.menuItemId === "10")?.discountEligible, false);
    assert.equal(lines.find((l) => l.menuItemId === "10")?.ineligibilityReason, "ITEM_PROMO");
    assert.equal(lines.find((l) => l.menuItemId === "20")?.discountEligible, true);
    assert.equal(lines.find((l) => l.menuItemId === "30")?.discountEligible, true);
    assert.equal(promoEligibleSubtotal(baseCtx({ orderLines: lines })), 259);
  });

  it("Boost on catalog item_id excludes PK cart lines — Flat 100 min 399 blocked", () => {
    // Merchant offers store item_id; checkout cart sends menu PK.
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "101", lineTotal: 176, quantity: 1 },
        { menuItemId: "102", lineTotal: 141, quantity: 1 },
        { menuItemId: "103", lineTotal: 159, quantity: 1 },
        { menuItemId: "104", lineTotal: 71, quantity: 1 },
      ],
      {
        mrpIneligibleIds: new Set(),
        merchantOffers: [
          boostOffer(["chapati-item", "chicken65-item", "biryani-item"]),
        ],
        now: new Date("2026-07-11T12:00:00Z"),
        extraAliasesByLineId: new Map([
          ["101", ["chapati-item"]],
          ["102", ["chicken65-item"]],
          ["103", ["biryani-item"]],
          ["104", ["poori-item"]],
        ]),
      }
    );
    assert.equal(lines.find((l) => l.menuItemId === "101")?.discountEligible, false);
    assert.equal(lines.find((l) => l.menuItemId === "104")?.discountEligible, true);
    assert.equal(promoEligibleSubtotal(baseCtx({ orderLines: lines })), 71);

    const ctx = baseCtx({
      itemSubtotal: 547,
      orderLines: lines,
      selectedPlatformOfferId: 99,
    });
    const rem: FeeRem = {
      items: 547,
      delivery: 37,
      platform: 0,
      packaging: 0,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state: MutableBillState = {
      discountTotal: 0,
      deliveryFee: 37,
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
    const flat100 = {
      id: 99,
      name: "Flat ₹100 Off",
      offerKind: "FLAT_DISCOUNT",
      discountType: "FIXED",
      valueNumeric: 100,
      maxDiscountAmount: null,
      minOrderAmount: 399,
      isHidden: false,
      fundingMode: "PLATFORM",
      platformSharePct: 100,
      merchantSharePct: 0,
      offerAudience: "CUSTOMER",
      customerSegment: "ALL",
      serviceType: "FOOD",
      startsAt: null,
      endsAt: null,
      merchantIds: [],
      conditions: {},
      buyQty: null,
      getQty: null,
      deliveryDiscountType: null,
      deliveryDiscountValue: null,
      priority: 1,
    } as unknown as PlatformOfferRow;

    applyPlatformCartOffers(
      ctx,
      {
        platformOffers: [flat100],
        merchantOffers: [],
        coupons: [],
        rules: [],
        taxConfig: null,
      } as unknown as BillingDataset,
      state,
      547,
      rem
    );
    assert.equal(state.discountTotal, 0, "Flat 100 must not apply when only ₹71 is promo-eligible");
  });

  it("mixed cart Flat 100 min 399 blocked when eligible is 259", () => {
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "A", lineTotal: 150, quantity: 1 },
        { menuItemId: "B", lineTotal: 140, quantity: 1 },
        { menuItemId: "C", lineTotal: 188, quantity: 1 },
        { menuItemId: "D", lineTotal: 71, quantity: 1 },
      ],
      {
        mrpIneligibleIds: new Set(),
        merchantOffers: [
          boostOffer(["A"]),
          {
            ...boostOffer(["B"]),
            id: 2,
            offerType: "BOGO",
            metadata: { conditions_mode: "boost", menu_item_ids: ["B"] },
          } as MerchantOfferRow,
        ],
        now: new Date("2026-07-11T12:00:00Z"),
      }
    );
    const eligible = promoEligibleSubtotal(baseCtx({ orderLines: lines }));
    assert.equal(eligible, 259);
    assert.equal(eligible >= 399, false);
  });

  it("all promo lines → eligible 0", () => {
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "A", lineTotal: 150, quantity: 1 },
        { menuItemId: "B", lineTotal: 140, quantity: 1 },
      ],
      {
        mrpIneligibleIds: new Set(),
        merchantOffers: [boostOffer([])], // store-wide
        now: new Date("2026-07-11T12:00:00Z"),
      }
    );
    assert.equal(promoEligibleSubtotal(baseCtx({ orderLines: lines })), 0);
  });

  it("matches Boost menu_item_ids across numeric / string aliases", () => {
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "42", lineTotal: 176, quantity: 1 },
        { menuItemId: "99", lineTotal: 71, quantity: 1 },
      ],
      {
        mrpIneligibleIds: new Set(),
        merchantOffers: [
          {
            ...boostOffer([]),
            metadata: { conditions_mode: "boost", menu_item_ids: [42] },
          } as MerchantOfferRow,
        ],
        now: new Date("2026-07-11T12:00:00Z"),
      }
    );
    assert.equal(lines.find((l) => l.menuItemId === "42")?.discountEligible, false);
    assert.equal(lines.find((l) => l.menuItemId === "99")?.discountEligible, true);
  });

  it("isItemSurfaceMerchantOffer recognizes Boost and BOGO", () => {
    assert.equal(
      isItemSurfaceMerchantOffer({
        offerType: "PERCENTAGE",
        metadata: { conditions_mode: "boost" },
      } as MerchantOfferRow),
      true
    );
    assert.equal(
      isItemSurfaceMerchantOffer({
        offerType: "BOGO",
        metadata: {},
      } as MerchantOfferRow),
      true
    );
    assert.equal(
      isItemSurfaceMerchantOffer({
        offerType: "PERCENTAGE",
        metadata: { conditions_mode: "precision" },
      } as MerchantOfferRow),
      false
    );
  });

  it("platform cart % uses promo-eligible subtotal only", () => {
    const ctx = baseCtx({
      itemSubtotal: 590,
      orderLines: [
        { menuItemId: "A", lineTotal: 240, quantity: 1, discountEligible: false },
        { menuItemId: "B", lineTotal: 200, quantity: 1, discountEligible: true },
        { menuItemId: "C", lineTotal: 150, quantity: 1, discountEligible: true },
      ],
      selectedPlatformOfferId: 99,
    });
    const rem: FeeRem = {
      items: 590,
      delivery: 30,
      platform: 0,
      packaging: 0,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state: MutableBillState = {
      discountTotal: 0,
      deliveryFee: 30,
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
    const offer = {
      id: 99,
      name: "20% OFF",
      offerKind: "DISCOUNT",
      discountType: "PERCENTAGE",
      valueNumeric: 20,
      maxDiscountAmount: null,
      minOrderAmount: 0,
      isHidden: false,
      fundingMode: "PLATFORM",
      platformSharePct: 100,
      merchantSharePct: 0,
      offerAudience: "CUSTOMER",
      customerSegment: "ALL",
      serviceType: "FOOD",
      startsAt: null,
      endsAt: null,
      merchantIds: [],
      conditions: {},
      buyQty: null,
      getQty: null,
      deliveryDiscountType: null,
      deliveryDiscountValue: null,
      priority: 1,
    } as unknown as PlatformOfferRow;

    const dataset = {
      platformOffers: [offer],
      merchantOffers: [],
      coupons: [],
      rules: [],
      taxConfig: null,
    } as unknown as BillingDataset;

    applyPlatformCartOffers(ctx, dataset, state, 590, rem);
    assert.equal(state.discountTotal, 70);
    assert.equal(rem.items, 520);
  });
});

describe("Boost apply with catalog↔PK aliases", () => {
  it("attributes item-surface % when offer targets item_id but cart uses menu PK", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");
    const offers: MerchantOfferRow[] = [
      {
        ...boostOffer(["chicken-65"]),
        discountPercentage: 25,
      },
      {
        ...boostOffer(["butter-chicken"]),
        id: 2,
        discountPercentage: 25,
        metadata: {
          conditions_mode: "boost",
          menu_item_ids: ["butter-chicken"],
        },
      } as MerchantOfferRow,
    ];
    const lines = markOrderLinesDiscountEligibility(
      [
        {
          menuItemId: "101",
          lineTotal: 141,
          quantity: 1,
          baseLineTotal: 141,
        },
        {
          menuItemId: "202",
          lineTotal: 176,
          quantity: 1,
          baseLineTotal: 176,
        },
      ],
      {
        mrpIneligibleIds: new Set(),
        merchantOffers: offers,
        now: new Date("2026-07-11T12:00:00Z"),
        extraAliasesByLineId: new Map([
          ["101", ["chicken-65"]],
          ["202", ["butter-chicken"]],
        ]),
      }
    );
    assert.equal(lines.every((l) => l.ineligibilityReason === "ITEM_PROMO"), true);

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: offers,
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const c = baseCtx({
      itemSubtotal: 317,
      addonSubtotal: 0,
      orderLines: lines.map((l) => ({
        menuItemId: l.menuItemId,
        lineTotal: l.lineTotal,
        quantity: l.quantity,
        baseLineTotal: l.lineTotal,
        discountEligible: l.discountEligible,
        ineligibilityReason: l.ineligibilityReason,
      })),
      menuIdAliasesByLineId: new Map([
        ["101", ["chicken-65"]],
        ["202", ["butter-chicken"]],
      ]),
      tipAmount: 0,
      donationAmount: 0,
      deliveryDefaultBaseInr: 0,
      deliveryDefaultPerKmInr: 0,
      distanceKm: null,
    });

    const r = executeBillingPipeline(c, dataset);
    // 25% of 141 + 25% of 176 = 35 + 44 = 79
    assert.equal(r.discount_total, 79);
    const pricing = r.order_line_pricing ?? [];
    assert.equal(pricing.length, 2);
    assert.ok((pricing[0]?.offerDiscountAmount ?? 0) >= 34);
    assert.ok((pricing[1]?.offerDiscountAmount ?? 0) >= 43);
  });

  it("Boost wins over store-wide BOGO on 1×A + 1×B (no cross-SKU BOGO)", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");
    const boostA = {
      ...boostOffer(["101"]),
      id: 10,
      title: "45% Boost",
      discountPercentage: 45,
    } as MerchantOfferRow;
    const boostB = {
      ...boostOffer(["202"]),
      id: 11,
      title: "45% Boost",
      discountPercentage: 45,
      metadata: { conditions_mode: "boost", menu_item_ids: ["202"] },
    } as MerchantOfferRow;
    const bogo = {
      ...boostOffer([]),
      id: 99,
      title: "Buy one get one",
      offerType: "BUY_X_GET_Y",
      discountPercentage: null,
      buyQuantity: 1,
      getQuantity: 1,
      metadata: { conditions_mode: "bogo" },
    } as MerchantOfferRow;

    const offers = [boostA, boostB, bogo];
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "101", lineTotal: 120, quantity: 1, baseLineTotal: 120 },
        { menuItemId: "202", lineTotal: 150, quantity: 1, baseLineTotal: 150 },
      ],
      {
        mrpIneligibleIds: new Set(),
        merchantOffers: offers,
        now: new Date("2026-07-11T12:00:00Z"),
      }
    );

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: offers,
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 270,
        addonSubtotal: 0,
        orderLines: lines.map((l) => ({
          menuItemId: l.menuItemId,
          lineTotal: l.lineTotal,
          quantity: l.quantity,
          baseLineTotal: l.lineTotal,
          discountEligible: l.discountEligible,
          ineligibilityReason: l.ineligibilityReason,
        })),
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );

    // 45% of 120 + 45% of 150 = 54 + 68 = 122 (round)
    assert.equal(r.discount_total, 54 + 68);
    const pricing = r.order_line_pricing ?? [];
    for (const row of pricing) {
      const t = String(row.appliedOfferType ?? "").toUpperCase();
      assert.ok(t === "PERCENTAGE" || t === "BOOST" || t === "FLAT");
      assert.ok(!/buy\s*one\s*get/i.test(String(row.appliedOfferLabel ?? "")));
    }
  });

  it("store-wide BOGO does not apply across different SKUs (1×A + 1×B)", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");
    const bogo = {
      ...boostOffer([]),
      id: 99,
      title: "Buy one get one",
      offerType: "BUY_X_GET_Y",
      discountPercentage: null,
      buyQuantity: 1,
      getQuantity: 1,
      metadata: { conditions_mode: "bogo" },
    } as MerchantOfferRow;

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [bogo],
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 270,
        addonSubtotal: 0,
        orderLines: [
          { menuItemId: "101", lineTotal: 120, quantity: 1, baseLineTotal: 120 },
          { menuItemId: "202", lineTotal: 150, quantity: 1, baseLineTotal: 150 },
        ],
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );
    assert.equal(r.discount_total, 0);
  });

  it("BOGO applies per SKU when qty covers buy+get", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");
    const bogo = {
      ...boostOffer([]),
      id: 99,
      title: "Buy one get one",
      offerType: "BUY_X_GET_Y",
      discountPercentage: null,
      buyQuantity: 1,
      getQuantity: 1,
      metadata: { conditions_mode: "bogo", menu_item_ids: ["101"] },
    } as MerchantOfferRow;

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [bogo],
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 240,
        addonSubtotal: 0,
        orderLines: [
          { menuItemId: "101", lineTotal: 240, quantity: 2, baseLineTotal: 240 },
        ],
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );
    assert.equal(r.discount_total, 120);
    const pricing = r.order_line_pricing ?? [];
    assert.equal(String(pricing[0]?.appliedOfferType ?? "").toUpperCase(), "BUY_X_GET_Y");
  });

  it("stamps BOGO type on targeted line even when qty < buy+get", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");
    const bogo = {
      ...boostOffer(["101"]),
      id: 99,
      title: "Buy one get one",
      offerType: "BUY_X_GET_Y",
      discountPercentage: null,
      buyQuantity: 1,
      getQuantity: 1,
      metadata: { conditions_mode: "bogo", menu_item_ids: ["101"] },
    } as MerchantOfferRow;

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [bogo],
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 71,
        addonSubtotal: 0,
        orderLines: [
          { menuItemId: "101", lineTotal: 71, quantity: 1, baseLineTotal: 71 },
        ],
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );
    assert.equal(r.discount_total, 0);
    const pricing = r.order_line_pricing ?? [];
    assert.equal(String(pricing[0]?.appliedOfferType ?? "").toUpperCase(), "BUY_X_GET_Y");
    assert.match(String(pricing[0]?.appliedOfferLabel ?? ""), /Buy One Get One/i);
  });

  it("non-stackable Boost does not block BOGO stamp on other lines", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");
    const boost = {
      ...boostOffer(["101"]),
      id: 10,
      title: "25% Boost",
      discountPercentage: 25,
      isStackable: false,
    } as MerchantOfferRow;
    const bogo = {
      ...boostOffer(["202"]),
      id: 99,
      title: "Buy one get one",
      offerType: "BUY_X_GET_Y",
      discountPercentage: null,
      buyQuantity: 1,
      getQuantity: 1,
      isStackable: false,
      metadata: { conditions_mode: "bogo", menu_item_ids: ["202"] },
    } as MerchantOfferRow;

    const offers = [boost, bogo];
    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "101", lineTotal: 120, quantity: 1, baseLineTotal: 120 },
        { menuItemId: "202", lineTotal: 71, quantity: 1, baseLineTotal: 71 },
      ],
      {
        mrpIneligibleIds: new Set(),
        merchantOffers: offers,
        now: new Date("2026-07-11T12:00:00Z"),
      }
    );

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: offers,
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 191,
        addonSubtotal: 0,
        orderLines: lines.map((l) => ({
          menuItemId: l.menuItemId,
          lineTotal: l.lineTotal,
          quantity: l.quantity,
          baseLineTotal: l.lineTotal,
          discountEligible: l.discountEligible,
          ineligibilityReason: l.ineligibilityReason,
        })),
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );

    const pricing = r.order_line_pricing ?? [];
    assert.equal(pricing.length, 2);
    assert.equal(String(pricing[0]?.appliedOfferType ?? "").toUpperCase(), "PERCENTAGE");
    assert.ok((pricing[0]?.offerDiscountAmount ?? 0) >= 29);
    assert.equal(String(pricing[1]?.appliedOfferType ?? "").toUpperCase(), "BUY_X_GET_Y");
    assert.match(String(pricing[1]?.appliedOfferLabel ?? ""), /Buy One Get One/i);
    assert.equal(pricing[1]?.offerDiscountAmount ?? 0, 0);
  });
});

describe("Merchant item offers lock the line — checkout-level (cart/Precision) offers never stack on top", () => {
  it("Boost item, BOGO item, and a plain item: the store-wide Precision offer only lands on the plain item", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");

    const boost = {
      ...boostOffer(["chicken-65"]),
      id: 1,
      title: "25% Off",
      discountPercentage: 25,
    } as MerchantOfferRow;
    const bogo = {
      ...boostOffer([]),
      id: 2,
      title: "Buy one get one",
      offerType: "BUY_X_GET_Y",
      discountPercentage: null,
      buyQuantity: 1,
      getQuantity: 1,
      metadata: { conditions_mode: "bogo", menu_item_ids: ["chola-poori"] },
    } as MerchantOfferRow;
    // Store-wide (no menu_item_ids) — auto-picked as the single cart-level promo.
    const precision = {
      ...boostOffer([]),
      id: 3,
      title: "Flat 20% Off",
      discountPercentage: 20,
      metadata: { conditions_mode: "precision" },
    } as MerchantOfferRow;
    const offers = [boost, bogo, precision];

    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "chicken-65", lineTotal: 400, quantity: 1, baseLineTotal: 400 },
        { menuItemId: "chola-poori", lineTotal: 240, quantity: 2, baseLineTotal: 240 },
        { menuItemId: "gobi-manchurian", lineTotal: 300, quantity: 1, baseLineTotal: 300 },
      ],
      { mrpIneligibleIds: new Set(), merchantOffers: offers, now: new Date("2026-07-11T12:00:00Z") }
    );
    assert.equal(lines.find((l) => l.menuItemId === "chicken-65")?.ineligibilityReason, "ITEM_PROMO");
    assert.equal(lines.find((l) => l.menuItemId === "chola-poori")?.ineligibilityReason, "ITEM_PROMO");
    assert.equal(lines.find((l) => l.menuItemId === "gobi-manchurian")?.discountEligible, true);

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: offers,
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 940,
        addonSubtotal: 0,
        orderLines: lines.map((l) => ({
          menuItemId: l.menuItemId,
          lineTotal: l.lineTotal,
          quantity: l.quantity,
          baseLineTotal: l.lineTotal,
          discountEligible: l.discountEligible,
          ineligibilityReason: l.ineligibilityReason,
        })),
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );

    const pricing = r.order_line_pricing ?? [];
    const chicken = pricing.find((p) => p.menuItemId === "chicken-65");
    const chola = pricing.find((p) => p.menuItemId === "chola-poori");
    const gobi = pricing.find((p) => p.menuItemId === "gobi-manchurian");

    // Locked to their own merchant item offer — the Precision offer must never touch them.
    assert.equal(chicken?.appliedOfferId, 1);
    assert.equal(String(chicken?.appliedOfferType ?? "").toUpperCase(), "PERCENTAGE");
    assert.ok((chicken?.offerDiscountAmount ?? 0) > 0);

    assert.equal(chola?.appliedOfferId, 2);
    assert.equal(String(chola?.appliedOfferType ?? "").toUpperCase(), "BUY_X_GET_Y");

    // Only the plain item is eligible — it alone receives the cart-level Precision discount.
    assert.equal(gobi?.appliedOfferId, 3);
    assert.equal(String(gobi?.appliedOfferType ?? "").toUpperCase(), "PERCENTAGE");
    assert.ok((gobi?.offerDiscountAmount ?? 0) > 0);
  });

  it("fully-locked cart (every item already has its own merchant offer): Precision contributes nothing, never overwrites either line", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");

    const boost = { ...boostOffer(["chicken-65"]), id: 1, title: "25% Off", discountPercentage: 25 } as MerchantOfferRow;
    const bogo = {
      ...boostOffer([]),
      id: 2,
      title: "Buy one get one",
      offerType: "BUY_X_GET_Y",
      discountPercentage: null,
      buyQuantity: 1,
      getQuantity: 1,
      metadata: { conditions_mode: "bogo", menu_item_ids: ["chola-poori"] },
    } as MerchantOfferRow;
    const precision = {
      ...boostOffer([]),
      id: 3,
      title: "Flat 20% Off",
      discountPercentage: 20,
      metadata: { conditions_mode: "precision" },
    } as MerchantOfferRow;
    const offers = [boost, bogo, precision];

    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "chicken-65", lineTotal: 400, quantity: 1, baseLineTotal: 400 },
        { menuItemId: "chola-poori", lineTotal: 240, quantity: 2, baseLineTotal: 240 },
      ],
      { mrpIneligibleIds: new Set(), merchantOffers: offers, now: new Date("2026-07-11T12:00:00Z") }
    );

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: offers,
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 640,
        addonSubtotal: 0,
        orderLines: lines.map((l) => ({
          menuItemId: l.menuItemId,
          lineTotal: l.lineTotal,
          quantity: l.quantity,
          baseLineTotal: l.lineTotal,
          discountEligible: l.discountEligible,
          ineligibilityReason: l.ineligibilityReason,
        })),
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );

    const pricing = r.order_line_pricing ?? [];
    const chicken = pricing.find((p) => p.menuItemId === "chicken-65");
    const chola = pricing.find((p) => p.menuItemId === "chola-poori");
    assert.equal(chicken?.appliedOfferId, 1);
    assert.equal(chola?.appliedOfferId, 2);
  });
});

describe("Item-surface offer targeting failure must never spread onto untargeted items", () => {
  it("Boost offer whose menu_item_ids don't alias-match any cart line contributes nothing — it must not discount other items in the cart", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");

    // Configured to target "butter-chicken", but the cart line below uses a
    // completely different id ("999") — simulates a catalog/menu-id mismatch.
    const boost = {
      ...boostOffer(["butter-chicken"]),
      id: 1,
      title: "25% Off",
      discountPercentage: 25,
    } as MerchantOfferRow;

    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "999", lineTotal: 176, quantity: 1, baseLineTotal: 176 },
        { menuItemId: "gobi-manchurian", lineTotal: 118, quantity: 1, baseLineTotal: 118 },
      ],
      { mrpIneligibleIds: new Set(), merchantOffers: [boost], now: new Date("2026-07-11T12:00:00Z") }
    );
    // Neither line is targeted by the Boost offer's ids, so neither is ITEM_PROMO-flagged.
    assert.equal(lines.every((l) => l.discountEligible !== false), true);

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [boost],
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 294,
        addonSubtotal: 0,
        orderLines: lines.map((l) => ({
          menuItemId: l.menuItemId,
          lineTotal: l.lineTotal,
          quantity: l.quantity,
          baseLineTotal: l.lineTotal,
          discountEligible: l.discountEligible,
          ineligibilityReason: l.ineligibilityReason,
        })),
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );

    // The misconfigured Boost must contribute $0 — never spread across the cart.
    assert.equal(r.discount_total, 0);
    const pricing = r.order_line_pricing ?? [];
    for (const row of pricing) {
      assert.equal(row.appliedOfferId, null);
      assert.equal(row.offerDiscountAmount, 0);
    }
  });
});

describe("Store-wide Boost must never claim or count a line owned by an item-specific BOGO", () => {
  it("store-wide 15% Boost + item-specific BOGO on one SKU: Boost discounts only the non-BOGO items, BOGO owns its line, and the Boost total excludes the BOGO item's value", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");

    // Store-wide Boost (no menu_item_ids) — would otherwise target every cart line.
    const boost = {
      ...boostOffer([]),
      id: 1,
      title: "15% Off",
      discountPercentage: 15,
      metadata: { conditions_mode: "boost" },
    } as MerchantOfferRow;
    // Item-specific BOGO on chola-poori only.
    const bogo = {
      ...boostOffer([]),
      id: 2,
      title: "Buy one get one",
      offerType: "BUY_X_GET_Y",
      discountPercentage: null,
      buyQuantity: 1,
      getQuantity: 1,
      metadata: { conditions_mode: "bogo", menu_item_ids: ["chola-poori"] },
    } as MerchantOfferRow;
    const offers = [boost, bogo];

    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "paneer", lineTotal: 200, quantity: 1, baseLineTotal: 200 },
        { menuItemId: "chola-poori", lineTotal: 142, quantity: 2, baseLineTotal: 142 },
        { menuItemId: "gobi", lineTotal: 120, quantity: 1, baseLineTotal: 120 },
      ],
      { mrpIneligibleIds: new Set(), merchantOffers: offers, now: new Date("2026-07-11T12:00:00Z") }
    );

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: offers,
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 462,
        addonSubtotal: 0,
        orderLines: lines.map((l) => ({
          menuItemId: l.menuItemId,
          lineTotal: l.lineTotal,
          quantity: l.quantity,
          baseLineTotal: l.lineTotal,
          discountEligible: l.discountEligible,
          ineligibilityReason: l.ineligibilityReason,
        })),
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );

    const pricing = r.order_line_pricing ?? [];
    const paneer = pricing.find((p) => p.menuItemId === "paneer");
    const chola = pricing.find((p) => p.menuItemId === "chola-poori");
    const gobi = pricing.find((p) => p.menuItemId === "gobi");

    // Boost owns the two non-BOGO items only.
    assert.equal(paneer?.appliedOfferId, 1);
    assert.equal(paneer?.offerDiscountAmount, 30); // 15% of 200
    assert.equal(gobi?.appliedOfferId, 1);
    assert.equal(gobi?.offerDiscountAmount, 18); // 15% of 120

    // The BOGO line is owned by BOGO — never claimed or discounted by the store-wide Boost.
    assert.equal(chola?.appliedOfferId, 2);
    assert.equal(String(chola?.appliedOfferType ?? "").toUpperCase(), "BUY_X_GET_Y");
    assert.equal(chola?.offerDiscountAmount, 71); // one free of the ₹71 pair, not 15%

    // The single "15% Off" Boost discount row must total only 48 (30 + 18), NEVER include
    // chola's value. discount_total = boost 48 + BOGO 71 = 119.
    const boostRow = (r.discounts ?? []).find(
      (d) => typeof d.meta?.merchantOfferId === "number" && d.meta.merchantOfferId === 1
    );
    assert.equal(boostRow?.amount, 48);
    assert.equal(r.discount_total, 119);
  });
});

/**
 * Production divergence: the Offers Sheet's BOOST "You save ₹66" was the billing engine's own
 * `discounts[]` amount for the Boost offer — inflated because the BOOST base counted a BOGO item.
 * BOOST must ALWAYS calculate on eligible Boost items only, never on BOGO / free-item / bundle
 * items, and this must hold regardless of offer specificity or the order the handlers run in.
 *
 * These cases lock every BOOST × BOGO specificity/ordering combination. The cart mirrors the
 * screenshot: two Boost-eligible lines (₹141, ₹176 → 15% = ₹21 + ₹26 = ₹47) plus a BOGO item
 * and a plain checkout-eligible item, so a correct BOOST row is ₹47 and NEVER ~₹66.
 */
describe("BOOST base never includes a BOGO item (every specificity/ordering combo)", () => {
  const runCart = async (
    boostMenuIds: string[],
    bogoMenuIds: string[]
  ) => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");
    const boost = {
      ...boostOffer(boostMenuIds),
      id: 1,
      title: "15% Off",
      discountPercentage: 15,
      metadata: { conditions_mode: "boost", menu_item_ids: boostMenuIds },
    } as MerchantOfferRow;
    const bogo = {
      ...boostOffer(bogoMenuIds),
      id: 2,
      title: "Buy one get one",
      offerType: "BUY_X_GET_Y",
      discountPercentage: null,
      buyQuantity: 1,
      getQuantity: 1,
      displayPriority: 5, // higher than boost — proves ordering isn't what protects the base
      metadata: { conditions_mode: "bogo", menu_item_ids: bogoMenuIds },
    } as MerchantOfferRow;
    const offers = [boost, bogo];

    const lines = markOrderLinesDiscountEligibility(
      [
        { menuItemId: "vegfried", lineTotal: 141, quantity: 1, baseLineTotal: 141 },
        { menuItemId: "butter", lineTotal: 176, quantity: 1, baseLineTotal: 176 },
        { menuItemId: "paneer", lineTotal: 258, quantity: 2, baseLineTotal: 258 },
        { menuItemId: "chicken", lineTotal: 423, quantity: 3, baseLineTotal: 423 },
      ],
      { mrpIneligibleIds: new Set(), merchantOffers: offers, now: new Date("2026-07-11T12:00:00Z") }
    );

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: offers,
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 998,
        addonSubtotal: 0,
        orderLines: lines.map((l) => ({
          menuItemId: l.menuItemId,
          lineTotal: l.lineTotal,
          quantity: l.quantity,
          baseLineTotal: l.lineTotal,
          discountEligible: l.discountEligible,
          ineligibilityReason: l.ineligibilityReason,
        })),
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );

    const boostRow = (r.discounts ?? []).find(
      (d) => typeof d.meta?.merchantOfferId === "number" && d.meta.merchantOfferId === 1
    );
    const pricing = r.order_line_pricing ?? [];
    return {
      boostAmount: boostRow?.amount ?? 0,
      paneer: pricing.find((p) => p.menuItemId === "paneer"),
      vegfried: pricing.find((p) => p.menuItemId === "vegfried"),
    };
  };

  it("store-wide BOOST + item-specific BOGO(paneer): BOOST covers every non-BOGO line, never paneer", async () => {
    // A store-wide Boost legitimately discounts all non-offer lines (vegfried 21 + butter 26 +
    // chicken 63 = 110). The ONLY line it must skip is the BOGO item — counting paneer's 15%
    // (₹39) would push this to 149, the class of over-count behind the production ₹66.
    const { boostAmount, paneer } = await runCart([], ["paneer"]);
    assert.equal(boostAmount, 110);
    assert.equal(String(paneer?.appliedOfferType ?? "").toUpperCase(), "BUY_X_GET_Y");
    assert.notEqual(paneer?.appliedOfferId, 1);
  });

  it("item-specific BOOST OVERLAPPING the BOGO item: BOOST still excludes paneer (was the ₹66 bug)", async () => {
    // Boost explicitly lists paneer in its menu_item_ids AND (via displayPriority) would run
    // first — before this fix it claimed paneer for 15% and inflated the row. Now paneer is a
    // BOGO item, so BOOST drops it from its base regardless of order.
    const { boostAmount, paneer } = await runCart(["vegfried", "butter", "paneer"], ["paneer"]);
    assert.equal(boostAmount, 47);
    assert.equal(String(paneer?.appliedOfferType ?? "").toUpperCase(), "BUY_X_GET_Y");
    assert.notEqual(paneer?.appliedOfferId, 1); // never claimed by the Boost
  });

  it("both offers item-specific, non-overlapping: BOOST unaffected, still 47", async () => {
    const { boostAmount, vegfried } = await runCart(["vegfried", "butter"], ["paneer"]);
    assert.equal(boostAmount, 47);
    assert.equal(vegfried?.appliedOfferId, 1);
  });
});

describe("Item-surface Boost only discounts lines the eligibility engine flagged ITEM_PROMO", () => {
  it("a broad Boost that would over-target a checkout-eligible line (Gobi Manchurian) must skip it — only the ITEM_PROMO line (Gobi 65) is discounted", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");

    // Broad Boost (no menu_item_ids → targetedOrderLines alone would return EVERY line).
    // The eligibility engine (Offer Engine v2 SSOT) has already decided gobi-manchurian is
    // checkout-eligible (no item offer) and only gobi-65 is ITEM_PROMO. Boost must obey that.
    const boost = {
      ...boostOffer([]),
      id: 1,
      title: "15% Off",
      discountPercentage: 15,
      metadata: { conditions_mode: "boost" },
    } as MerchantOfferRow;

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [boost],
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 696,
        addonSubtotal: 0,
        orderLines: [
          {
            menuItemId: "gobi-manchurian",
            lineTotal: 590,
            quantity: 5,
            baseLineTotal: 590,
            discountEligible: true,
            ineligibilityReason: null,
          },
          {
            menuItemId: "gobi-65",
            lineTotal: 106,
            quantity: 1,
            baseLineTotal: 106,
            discountEligible: false,
            ineligibilityReason: "ITEM_PROMO",
          },
        ],
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );

    const pricing = r.order_line_pricing ?? [];
    const gm = pricing.find((p) => p.menuItemId === "gobi-manchurian");
    const g65 = pricing.find((p) => p.menuItemId === "gobi-65");

    // Boost applies ONLY to the ITEM_PROMO line — 15% of ₹106 = ₹16.
    assert.equal(g65?.appliedOfferId, 1);
    assert.equal(g65?.offerDiscountAmount, 16);

    // The checkout-eligible line is never touched by Boost (it belongs to precision/coupon).
    assert.equal(gm?.appliedOfferId, null);
    assert.equal(gm?.offerDiscountAmount, 0);

    // Total Boost = ₹16, NEVER ₹105 (which would be 15% of the whole 590+106 base).
    assert.equal(r.discount_total, 16);
  });
});

describe("Item-surface BOGO only discounts lines the eligibility engine flagged ITEM_PROMO", () => {
  it("a broad BOGO must not free-unit a checkout-eligible line (Gobi Manchurian ×5) — only the ITEM_PROMO BOGO line (Chola ×2) gets the free unit", async () => {
    const { executeBillingPipeline } = await import("./executeBillingPipeline.js");

    // Broad BOGO (no menu_item_ids → targetedRaw alone would return EVERY line, and
    // Gobi Manchurian ×5 would wrongly yield 2 free units = ₹236). Eligibility (SSOT) has
    // decided gobi-manchurian is checkout-eligible and only chola-poori is ITEM_PROMO.
    const bogo = {
      ...boostOffer([]),
      id: 1,
      title: "Buy one get one",
      offerType: "BUY_X_GET_Y",
      discountPercentage: null,
      buyQuantity: 1,
      getQuantity: 1,
      metadata: { conditions_mode: "bogo" },
    } as MerchantOfferRow;

    const dataset = {
      rulesetVersion: 1,
      rules: [],
      deliverySlabs: [],
      packagingSlabs: [],
      deliveryRateCards: [],
      platformOffers: [],
      merchantOffers: [bogo],
      taxConfigs: [],
      merchantOverrides: null,
      coupon: null,
    } as unknown as BillingDataset;

    const r = executeBillingPipeline(
      baseCtx({
        itemSubtotal: 732,
        addonSubtotal: 0,
        orderLines: [
          {
            menuItemId: "gobi-manchurian",
            lineTotal: 590,
            quantity: 5,
            baseLineTotal: 590,
            discountEligible: true,
            ineligibilityReason: null,
          },
          {
            menuItemId: "chola-poori",
            lineTotal: 142,
            quantity: 2,
            baseLineTotal: 142,
            discountEligible: false,
            ineligibilityReason: "ITEM_PROMO",
          },
        ],
        tipAmount: 0,
        donationAmount: 0,
        deliveryDefaultBaseInr: 0,
        deliveryDefaultPerKmInr: 0,
        distanceKm: null,
      }),
      dataset
    );

    const pricing = r.order_line_pricing ?? [];
    const gm = pricing.find((p) => p.menuItemId === "gobi-manchurian");
    const chola = pricing.find((p) => p.menuItemId === "chola-poori");

    // BOGO frees exactly one ₹71 unit of the ITEM_PROMO Chola pair.
    assert.equal(chola?.appliedOfferId, 1);
    assert.equal(String(chola?.appliedOfferType ?? "").toUpperCase(), "BUY_X_GET_Y");
    assert.equal(chola?.offerDiscountAmount, 71);

    // The checkout-eligible line is never touched by BOGO.
    assert.equal(gm?.appliedOfferId, null);
    assert.equal(gm?.offerDiscountAmount, 0);

    // Total BOGO = ₹71 (one free Chola unit), NEVER ₹236 (2 free Gobi Manchurian units).
    assert.equal(r.discount_total, 71);
  });
});
