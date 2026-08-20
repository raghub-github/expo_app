/**
 * Canonical item CTM pricing tests (gross-up commission AFTER merchant Boost).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MerchantOfferRow } from "../billing/types.js";
import { markupRupeesPaise } from "../commission/pricing.js";
import {
  assertItemPricingInvariants,
  bogoQuantitySplit,
  boostDiscountOnCtmLine,
  parseCanonicalPricing,
  pickWinningItemBoost,
  resolveItemPricing,
  serializeCanonicalPricing,
} from "./canonicalItemPricing.js";

function offer(overrides: Partial<MerchantOfferRow> & { offerType: string }): MerchantOfferRow {
  return {
    id: 1,
    offerId: "o1",
    title: "Boost",
    offerSubType: "SPECIFIC_ITEM",
    discountValue: null,
    discountPercentage: null,
    maxDiscountAmount: null,
    minOrderAmount: null,
    maxOrderAmount: null,
    buyQuantity: null,
    getQuantity: null,
    couponCode: null,
    autoApply: true,
    isStackable: false,
    perOrderLimit: 1,
    firstOrderOnly: false,
    newUserOnly: false,
    maxUsesTotal: null,
    maxUsesPerUser: null,
    currentUses: 0,
    applicableOnDays: null,
    applicableTimeStart: null,
    applicableTimeEnd: null,
    maxDiscountPerOrder: null,
    metadata: { conditions_mode: "boost", menu_item_ids: ["10"] },
    displayPriority: 10,
    priority: 10,
    createdSourcePlatform: "MERCHANT_APP",
    createdByRole: "MERCHANT",
    approvalStatus: "AUTO_APPROVED",
    ...overrides,
  };
}

describe("canonical item pricing — store offer first, then Commission Engine", () => {
  it("TEST 1 — no offer: MX ₹149 @ 15% → customer ₹175.29, MX ₹149", () => {
    const p = resolveItemPricing({
      baseCtmUnit: 149,
      quantity: 1,
      commissionPercent: 15,
      offers: [],
      menuItemId: 10,
    });
    assertItemPricingInvariants(p);
    assert.equal(p.discountedCtmLine, 149);
    assert.equal(p.customerItemPriceUnit, markupRupeesPaise(149, 15));
    assert.equal(p.customerItemPriceUnit, 175.29);
    assert.equal(p.merchantSettlementCtm, 149);
    assert.equal(p.commissionAmount, 26.29);
    assert.equal(p.merchantOfferType, "NONE");
    assert.equal(p.baseCtmLine, p.discountedCtmLine);
  });

  it("TEST 2 — 40% store offer then Commission Engine: ₹149 → ₹89.40 MX → customer ₹105.18", () => {
    const p = resolveItemPricing({
      baseCtmUnit: 149,
      quantity: 1,
      commissionPercent: 15,
      offers: [offer({ offerType: "PERCENTAGE", discountPercentage: 40, title: "Flat 40% OFF" })],
      menuItemId: 10,
    });
    assertItemPricingInvariants(p);
    assert.equal(p.merchantDiscountAmount, 59.6);
    assert.equal(p.discountedCtmLine, 89.4);
    assert.equal(p.customerItemPriceUnit, markupRupeesPaise(89.4, 15));
    assert.equal(p.customerItemPriceUnit, 105.18);
    assert.equal(p.merchantSettlementCtm, 89.4);
    assert.equal(p.commissionAmount, 15.78);
    assert.equal(p.merchantOfferType, "PERCENTAGE");
    assert.equal(p.merchantOfferName, "Flat 40% OFF");
    assert.notEqual(p.baseCtmLine, p.discountedCtmLine);
  });

  it("TEST 3 — commission is configuration-driven (20% without code change)", () => {
    const none = resolveItemPricing({
      baseCtmUnit: 149,
      quantity: 1,
      commissionPercent: 20,
      offers: [],
      menuItemId: 10,
    });
    assert.equal(none.customerItemPriceUnit, markupRupeesPaise(149, 20));
    assert.equal(none.customerItemPriceUnit, 186.25);
    const offered = resolveItemPricing({
      baseCtmUnit: 149,
      quantity: 1,
      commissionPercent: 20,
      offers: [offer({ offerType: "PERCENTAGE", discountPercentage: 40 })],
      menuItemId: 10,
    });
    assert.equal(offered.discountedCtmLine, 89.4);
    assert.equal(offered.customerItemPriceUnit, markupRupeesPaise(89.4, 20));
    assert.equal(offered.customerItemPriceUnit, 111.75);
  });

  it("₹15 + 40% store offer @ 15%", () => {
    const p = resolveItemPricing({
      baseCtmUnit: 15,
      quantity: 1,
      commissionPercent: 15,
      offers: [offer({ offerType: "PERCENTAGE", discountPercentage: 40 })],
      menuItemId: 10,
    });
    assertItemPricingInvariants(p);
    assert.equal(p.merchantDiscountAmount, 6);
    assert.equal(p.discountedCtmLine, 9);
    assert.equal(p.customerItemPriceUnit, 10.59);
    assert.equal(p.merchantSettlementCtm, 9);
  });

  it("TEST 8 — two mapped Boosts: item-specific wins over store-wide", () => {
    const storeWide = offer({
      id: 2,
      offerType: "PERCENTAGE",
      discountPercentage: 10,
      metadata: { conditions_mode: "boost" },
      displayPriority: 99,
    });
    const specific = offer({
      id: 3,
      offerType: "PERCENTAGE",
      discountPercentage: 40,
      metadata: { conditions_mode: "boost", menu_item_ids: ["10"] },
      displayPriority: 1,
    });
    const winner = pickWinningItemBoost([storeWide, specific], ["10"]);
    assert.equal(winner?.id, 3);
    const disc = boostDiscountOnCtmLine(100, 1, winner!);
    assert.equal(disc, 40);
  });

  it("TEST 6 — BOGO does not reduce merchant CTM; customer still marked up on full CTM", () => {
    const p = resolveItemPricing({
      baseCtmUnit: 100,
      quantity: 2,
      commissionPercent: 15,
      offers: [
        offer({
          id: 9,
          offerType: "BOGO",
          buyQuantity: 1,
          getQuantity: 1,
          metadata: { menu_item_ids: ["10"] },
        }),
      ],
      menuItemId: 10,
    });
    assert.equal(p.merchantOfferType, "NONE");
    assert.equal(p.baseCtmLine, 200);
    assert.equal(p.discountedCtmLine, 200);
    assert.equal(p.merchantSettlementCtm, 200);
    assert.equal(p.customerItemPriceUnit, markupRupeesPaise(100, 15));
  });

  it("TEST 7 — BOGO qty split is paid+free; merchant CTM stays full fulfilled qty", () => {
    const split = bogoQuantitySplit(2, 1, 1);
    assert.equal(split.fulfilledQuantity, 2);
    assert.equal(split.paidQuantity, 1);
    assert.equal(split.freeQuantity, 1);
    const p = resolveItemPricing({
      baseCtmUnit: 100,
      quantity: 2,
      commissionPercent: 15,
      offers: [],
      menuItemId: 10,
    });
    assert.equal(p.merchantSettlementCtm, 200);
    assert.equal(p.discountedCtmLine, 200);
  });

  it("TEST 9 — expired weekday window does not apply", () => {
    const o = offer({
      offerType: "PERCENTAGE",
      discountPercentage: 40,
      applicableOnDays: ["sun"],
    });
    const now = new Date("2026-08-19T12:00:00");
    const p = resolveItemPricing({
      baseCtmUnit: 100,
      quantity: 1,
      commissionPercent: 15,
      offers: [o],
      menuItemId: 10,
      now,
    });
    assert.equal(p.merchantOfferType, "NONE");
    assert.equal(p.discountedCtmLine, 100);
  });

  it("serializeCanonicalPricing round-trips v2 fields", () => {
    const p = resolveItemPricing({
      baseCtmUnit: 100,
      quantity: 1,
      commissionPercent: 15,
      offers: [offer({ offerType: "PERCENTAGE", discountPercentage: 40 })],
      menuItemId: 10,
    });
    const parsed = parseCanonicalPricing(serializeCanonicalPricing(p));
    assert.ok(parsed);
    assert.equal(parsed!.discountedCtmLine, 60);
    assert.equal(parsed!.customerItemPriceUnit, markupRupeesPaise(60, 15));
    assert.equal(parsed!.merchantSettlementCtm, 60);
    assert.equal(parsed!.merchantOfferType, "PERCENTAGE");
  });

  it("does not apply Boost to a BOGO-owned item", () => {
    const boost = offer({ offerType: "PERCENTAGE", discountPercentage: 40 });
    const bogo = offer({
      id: 9,
      offerType: "BOGO",
      buyQuantity: 1,
      getQuantity: 1,
      metadata: { menu_item_ids: ["10"] },
    });
    const p = resolveItemPricing({
      baseCtmUnit: 100,
      quantity: 2,
      commissionPercent: 15,
      offers: [boost, bogo],
      menuItemId: 10,
    });
    assert.equal(p.merchantOfferType, "NONE");
    assert.equal(p.discountedCtmLine, 200);
    assert.equal(p.customerItemPriceUnit, markupRupeesPaise(100, 15));
  });

  it("TEST 10 — time window miss: expired hours do not apply", () => {
    const o = offer({
      offerType: "PERCENTAGE",
      discountPercentage: 40,
      applicableTimeStart: "00:00",
      applicableTimeEnd: "00:01",
    });
    const now = new Date("2026-08-19T12:00:00");
    const p = resolveItemPricing({
      baseCtmUnit: 100,
      quantity: 1,
      commissionPercent: 15,
      offers: [o],
      menuItemId: 10,
      now,
    });
    assert.equal(p.merchantOfferType, "NONE");
    assert.equal(p.discountedCtmLine, 100);
  });

  it("TEST 11 — offer mapped to a different item does not apply", () => {
    const o = offer({
      offerType: "PERCENTAGE",
      discountPercentage: 40,
      metadata: { conditions_mode: "boost", menu_item_ids: ["99"] },
    });
    const p = resolveItemPricing({
      baseCtmUnit: 100,
      quantity: 1,
      commissionPercent: 15,
      offers: [o],
      menuItemId: 10,
    });
    assert.equal(p.merchantOfferType, "NONE");
  });

  it("FLAT Boost is on CTM not on inflated customer price", () => {
    const p = resolveItemPricing({
      baseCtmUnit: 100,
      quantity: 1,
      commissionPercent: 15,
      offers: [offer({ offerType: "FLAT", discountValue: 20, discountPercentage: 0 })],
      menuItemId: 10,
    });
    assertItemPricingInvariants(p);
    assert.equal(p.discountedCtmLine, 80);
    assert.equal(p.customerItemPriceUnit, markupRupeesPaise(80, 15));
    assert.equal(p.merchantOfferType, "FLAT");
    assert.equal(p.merchantSettlementCtm, 80);
  });
});
