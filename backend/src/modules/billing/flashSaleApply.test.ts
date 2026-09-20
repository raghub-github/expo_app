import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFoodFlashSaleOverlayToItems,
  overlayFlashSaleOnMenuRows,
  stampFlashSaleSubsidyLines,
  markFlashSaleOrderLines,
} from "./flashSaleApply.js";
import { classifyFlashSaleInsertConflict, mergeFlashSaleSnapshot, shouldRestoreFlashSaleRedemption } from "./flashSale.js";
import { cartPromoQualifyingSubtotal } from "./discountEligibility.js";
import { applyPlatformCartOffers, estimateOfferDiscountValue, platformOfferEligible } from "./platformOffersApply.js";
import { platformOfferBudgetAvailable } from "./platformOfferUsage.service.js";
import type {
  BillContext,
  BillingDataset,
  FeeRem,
  MutableBillState,
  PlatformOfferRow,
} from "./types.js";
import type { NormalizedOrderItem } from "../orders/orderNormalizer.js";

const baseCtx = (overrides: Partial<BillContext> = {}): BillContext => ({
  itemSubtotal: 99,
  addonSubtotal: 0,
  addonQtyTotal: 0,
  orderLines: [],
  distanceKm: 1,
  merchantStoreId: 42,
  merchantParentId: null,
  now: new Date(),
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
  dropGeoRefByLevel: { pincode: "pin-uuid" },
  platformOfferGeoBindingEffectiveIds: new Set([7]),
  checkoutCouponGeoBindingEffectiveIds: new Set([7]),
  deliveryFeeFromRateCard: 0,
  deliveryFeeFromGeo: null,
  deliveryDefaultBaseInr: 0,
  deliveryDefaultPerKmInr: 0,
  tipAmount: 0,
  donationAmount: 0,
  checkoutAudience: "CUSTOMER",
  subscriptionOptIn: false,
  ...overrides,
});

const flashOffer = (overrides: Partial<PlatformOfferRow> = {}): PlatformOfferRow => ({
  id: 7,
  name: "Flash",
  couponCode: "FLASH9",
  promoConfig: { auto_apply: true },
  serviceType: "FOOD",
  discountType: "FIXED",
  valueNumeric: null,
  deliveryDiscountType: null,
  deliveryDiscountValue: null,
  offerKind: "FLASH_SALE",
  offerAudience: "CUSTOMER",
  fundingMode: "PLATFORM_ONLY",
  platformSharePct: 100,
  merchantSharePct: 0,
  maxPlatformContribution: null,
  maxMerchantContribution: null,
  targetScope: "MERCHANT",
  geoLevel: null,
  geoIds: [],
  merchantIds: [42],
  customerSegment: "ALL",
  minOrderAmount: null,
  maxDiscountAmount: null,
  buyQty: null,
  getQty: null,
  isStackable: false,
  exclusionGroup: null,
  startsAt: null,
  endsAt: null,
  budgetTotal: 10000,
  budgetUsed: 0,
  maxUsesTotal: null,
  maxUsesPerUser: 1,
  maxUsesPerDay: null,
  maxUsesPerMonth: null,
  consumeMode: "ON_PLACED",
  restoreOnCancel: true,
  restoreOnRefund: true,
  priority: 0,
  isHidden: false,
  conditions: {
    menu_item_ids: ["10"],
    flash_sale_items: [{ menu_item_id: "10", flash_price: 9 }],
    max_flash_quantity: 1,
  },
  ...overrides,
});

const dataset = (offers: PlatformOfferRow[]): BillingDataset => ({
  rulesetVersion: 1,
  rules: [],
  deliverySlabs: [],
  packagingSlabs: [],
  deliveryRateCards: [],
  platformOffers: offers,
  merchantOffers: [],
  taxConfigs: [],
  merchantOverrides: null,
  coupon: null,
});

function item(overrides: Partial<NormalizedOrderItem> = {}): NormalizedOrderItem {
  return {
    menuItemId: 10,
    itemName: "Paneer",
    quantity: 1,
    basePrice: 99,
    variantId: null,
    variantKey: null,
    variantName: null,
    addons: [],
    itemSnapshot: {
      canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 99 },
    },
    specialInstructions: null,
    ...overrides,
  };
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

describe("FLASH_SALE overlay apply", () => {
  it("₹99 → ₹9: customer unit ₹9, subsidy ₹90, catalogue field on the row is display-only", () => {
    const rows = [{ id: 10, selling_price: "99.00" }];
    overlayFlashSaleOnMenuRows(rows, [flashOffer()]);
    assert.equal(rows[0]!.selling_price, "9.00");
    assert.equal(rows[0]!.customer_strike_price, "99.00");
    assert.equal(
      (rows[0] as { flash_sale?: { subsidy_unit?: number } }).flash_sale?.subsidy_unit,
      90
    );
  });

  it("does not overlay a different store item", () => {
    const rows = [{ id: 99, selling_price: "99.00" }];
    overlayFlashSaleOnMenuRows(rows, [flashOffer()]);
    assert.equal(rows[0]!.selling_price, "99.00");
  });

  it("checkout overlay rewrites customer unit and flags a stale client flash price", () => {
    const ctx = baseCtx();
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [
        item({
          itemSnapshot: {
            canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 99 },
            flash_sale: { offer_id: 7, flash_price: 19 },
          },
        }),
      ],
      ctx,
      dataset: dataset([flashOffer()]),
    });
    assert.equal(applied.items[0]!.basePrice, 9);
    assert.equal(applied.overlay.subsidyTotal, 90);
    assert.equal(applied.stalePrice, true);
    assert.equal(applied.staleClientFlash, false);
  });

  it("qty 3 of the ₹9 item is one overlay with ₹270 subsidy when max_flash_quantity allows it", () => {
    const ctx = baseCtx({ itemSubtotal: 297 });
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [item({ quantity: 3, itemSnapshot: { canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 297 } } })],
      ctx,
      dataset: dataset([
        flashOffer({
          conditions: {
            menu_item_ids: ["10"],
            flash_sale_items: [{ menu_item_id: "10", flash_price: 9 }],
            max_flash_quantity: 5,
          },
        }),
      ]),
    });
    assert.equal(applied.qtyExceeded, null);
    assert.equal(applied.overlay.subsidyTotal, 270);
    assert.equal(applied.items[0]!.basePrice, 9);
  });

  it("qty 2 with max_flash_quantity 1 applies flash to 1 unit and regular price to the rest", () => {
    const ctx = baseCtx({ itemSubtotal: 198 });
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [item({ quantity: 2, itemSnapshot: { canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 198 } } })],
      ctx,
      dataset: dataset([flashOffer()]),
    });
    assert.equal(applied.qtyExceeded, null);
    assert.equal(applied.overlay.lines.length, 1);
    assert.equal(applied.overlay.lines[0]!.quantity, 1);
    assert.equal(applied.overlay.subsidyTotal, 90); // (99-9)*1
    // Blended unit: (9*1 + 99*1) / 2 = 54
    assert.equal(applied.items[0]!.basePrice, 54);
  });

  it("qty 6 with max_flash_quantity 5 flashes 5 units and charges 1 at regular", () => {
    const ctx = baseCtx({ itemSubtotal: 594 });
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [
        item({
          quantity: 6,
          itemSnapshot: { canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 594 } },
        }),
      ],
      ctx,
      dataset: dataset([
        flashOffer({
          conditions: {
            menu_item_ids: ["10"],
            flash_sale_items: [{ menu_item_id: "10", flash_price: 9 }],
            max_flash_quantity: 5,
          },
        }),
      ]),
    });
    assert.equal(applied.qtyExceeded, null);
    assert.equal(applied.overlay.lines[0]!.quantity, 5);
    assert.equal(applied.overlay.subsidyTotal, 450); // (99-9)*5
    // Blended: (9*5 + 99*1) / 6 = 24
    assert.equal(applied.items[0]!.basePrice, 24);
  });

  it("two qty-1 lines of the same item: only the first gets flash when max_flash_quantity is 1", () => {
    const ctx = baseCtx({ itemSubtotal: 198 });
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [
        item({ quantity: 1 }),
        item({ quantity: 1, variantKey: "split" }),
      ],
      ctx,
      dataset: dataset([flashOffer()]),
    });
    assert.equal(applied.qtyExceeded, null);
    assert.equal(applied.overlay.lines.length, 1);
    assert.equal(applied.items[0]!.basePrice, 9);
    assert.equal(applied.items[1]!.basePrice, 99);
  });

  it("max_flash_quantity is per eligible item: 1 of each flash item in the same order is allowed", () => {
    const ctx = baseCtx({ itemSubtotal: 297 });
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [
        item({ menuItemId: 10, quantity: 1 }),
        item({ menuItemId: 11, quantity: 1, itemName: "Sandwich" }),
        item({ menuItemId: 12, quantity: 1, itemName: "Tandoori" }),
      ],
      ctx,
      dataset: dataset([
        flashOffer({
          conditions: {
            menu_item_ids: ["10", "11", "12"],
            flash_sale_items: [
              { menu_item_id: "10", flash_price: 19 },
              { menu_item_id: "11", flash_price: 21 },
              { menu_item_id: "12", flash_price: 39 },
            ],
            max_flash_quantity: 1,
          },
        }),
      ]),
    });
    assert.equal(applied.qtyExceeded, null);
    assert.equal(applied.overlay.lines.length, 3);
    assert.equal(applied.items[0]!.basePrice, 19);
    assert.equal(applied.items[1]!.basePrice, 21);
    assert.equal(applied.items[2]!.basePrice, 39);
  });

  it("mixed over-limit quantities flash the capped units and charge the rest at regular", () => {
    const ctx = baseCtx({ itemSubtotal: 693 });
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [
        item({
          menuItemId: 10,
          quantity: 3,
          itemName: "Burger",
          itemSnapshot: { canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 297 } },
        }),
        item({
          menuItemId: 11,
          quantity: 2,
          itemName: "Sandwich",
          itemSnapshot: { canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 198 } },
        }),
        item({
          menuItemId: 12,
          quantity: 1,
          itemName: "Tandoori",
          itemSnapshot: { canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 99 } },
        }),
      ],
      ctx,
      dataset: dataset([
        flashOffer({
          conditions: {
            menu_item_ids: ["10", "11", "12"],
            flash_sale_items: [
              { menu_item_id: "10", flash_price: 19 },
              { menu_item_id: "11", flash_price: 21 },
              { menu_item_id: "12", flash_price: 39 },
            ],
            max_flash_quantity: 1,
          },
        }),
      ]),
    });
    assert.equal(applied.qtyExceeded, null);
    assert.equal(applied.overlay.lines.length, 3);
    // Burger: (19 + 99 + 99) / 3
    assert.equal(applied.items[0]!.basePrice, 72.33);
    // Sandwich: (21 + 99) / 2
    assert.equal(applied.items[1]!.basePrice, 60);
    assert.equal(applied.items[2]!.basePrice, 39);
  });

  it("max_flash_quantity 2 allows 2 of each eligible item in the same order", () => {
    const ctx = baseCtx({ itemSubtotal: 594 });
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [
        item({ menuItemId: 10, quantity: 2, itemName: "Burger" }),
        item({ menuItemId: 11, quantity: 2, itemName: "Sandwich" }),
        item({ menuItemId: 12, quantity: 2, itemName: "Tandoori" }),
      ],
      ctx,
      dataset: dataset([
        flashOffer({
          conditions: {
            menu_item_ids: ["10", "11", "12"],
            flash_sale_items: [
              { menu_item_id: "10", flash_price: 19 },
              { menu_item_id: "11", flash_price: 21 },
              { menu_item_id: "12", flash_price: 39 },
            ],
            max_flash_quantity: 2,
          },
        }),
      ]),
    });
    assert.equal(applied.qtyExceeded, null);
    assert.equal(applied.overlay.lines.length, 3);
    assert.equal(applied.items[0]!.basePrice, 19);
    assert.equal(applied.items[1]!.basePrice, 21);
    assert.equal(applied.items[2]!.basePrice, 39);
  });

  it("max_flash_quantity 2 flashes 2 units and charges the 3rd at regular", () => {
    const ctx = baseCtx({ itemSubtotal: 297 });
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [
        item({
          menuItemId: 10,
          quantity: 3,
          itemName: "Burger",
          itemSnapshot: { canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 297 } },
        }),
      ],
      ctx,
      dataset: dataset([
        flashOffer({
          conditions: {
            menu_item_ids: ["10"],
            flash_sale_items: [{ menu_item_id: "10", flash_price: 19 }],
            max_flash_quantity: 2,
          },
        }),
      ]),
    });
    assert.equal(applied.qtyExceeded, null);
    assert.equal(applied.overlay.lines[0]!.quantity, 2);
    assert.equal(applied.overlay.subsidyTotal, 160); // (99-19)*2
    // Blended: (19*2 + 99*1) / 3 = 45.666… → 45.67
    assert.equal(applied.items[0]!.basePrice, 45.67);
  });

  it("manipulated qty 100 only flashes max_flash_quantity units", () => {
    const ctx = baseCtx({ itemSubtotal: 9900 });
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [
        item({
          quantity: 100,
          itemSnapshot: { canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 9900 } },
        }),
      ],
      ctx,
      dataset: dataset([flashOffer()]),
    });
    assert.equal(applied.qtyExceeded, null);
    assert.equal(applied.overlay.lines[0]!.quantity, 1);
    assert.equal(applied.overlay.subsidyTotal, 90);
    // Blended: (9*1 + 99*99) / 100 = 98.1
    assert.equal(applied.items[0]!.basePrice, 98.1);
  });

  it("stamps a non-bill-reducing subsidy line so payable is not discounted twice", () => {
    const ctx = baseCtx();
    const overlay = applyFoodFlashSaleOverlayToItems({
      items: [item()],
      ctx,
      dataset: dataset([flashOffer()]),
    });
    ctx.flashSaleOverlay = overlay.overlay;
    ctx.orderLines = [
      {
        menuItemId: "10",
        lineTotal: 9,
        quantity: 1,
        baseLineTotal: 9,
        addonLineTotal: 0,
        discountEligible: true,
      },
    ];
    const state = emptyState();
    markFlashSaleOrderLines(ctx);
    stampFlashSaleSubsidyLines(ctx, state);
    assert.equal(state.discountTotal, 0);
    assert.equal(state.discounts[0]!.amount, 90);
    assert.equal(state.discounts[0]!.meta?.doesNotReducePayable, true);
    assert.equal(state.discounts[0]!.meta?.platformContribution, 90);
    assert.equal(state.discounts[0]!.meta?.originalItemPrice, 99);
    assert.equal(state.discounts[0]!.meta?.flashSalePrice, 9);
    assert.equal(ctx.orderLines[0]!.offerDiscountAmount, 0);
    assert.equal(ctx.orderLines[0]!.appliedOfferType, "FLASH_SALE");
    assert.equal(ctx.orderLines[0]!.discountEligible, false);
    const remItems = 9;
    assert.equal(cartPromoQualifyingSubtotal(ctx, remItems), 0);
  });

  it("legacy FLASH_SALE cart % configs without flash_sale_items do not overlay or cart-discount", () => {
    const legacy = flashOffer({
      offerKind: "FLASH_SALE",
      discountType: "PERCENTAGE",
      valueNumeric: 50,
      conditions: {},
    });
    const rows = [{ id: 10, selling_price: "99.00" }];
    overlayFlashSaleOnMenuRows(rows, [legacy]);
    assert.equal(rows[0]!.selling_price, "99.00");
    const rem: FeeRem = {
      items: 99,
      delivery: 0,
      platform: 0,
      packaging: 0,
      surge: 0,
      smallOrder: 0,
      convenience: 0,
      misc: 0,
    };
    const state = emptyState();
    applyPlatformCartOffers(baseCtx(), dataset([legacy]), state, 99, rem);
    assert.equal(rem.items, 99);
    assert.equal(estimateOfferDiscountValue(baseCtx(), legacy, rem), 0);
  });

  it("classifies unique redemption conflicts: same order retry vs second customer use", () => {
    assert.equal(
      classifyFlashSaleInsertConflict(
        'duplicate key value violates unique constraint "flash_sale_redemptions_offer_order_uidx"'
      ),
      "idempotent"
    );
    assert.equal(
      classifyFlashSaleInsertConflict(
        'duplicate key value violates unique constraint "flash_sale_redemptions_idempotency_uidx"'
      ),
      "idempotent"
    );
    assert.equal(
      classifyFlashSaleInsertConflict(
        'duplicate key value violates unique constraint "flash_sale_redemptions_customer_offer_active_uidx"'
      ),
      "already_redeemed"
    );
  });

  it("skips overlay when the offer is expired, inactive, or out of budget", () => {
    const ctx = baseCtx({ now: new Date("2026-09-16T10:00:00+05:30") });
    const expired = applyFoodFlashSaleOverlayToItems({
      items: [item()],
      ctx,
      dataset: dataset([flashOffer({ endsAt: new Date("2026-09-01T00:00:00Z") })]),
    });
    assert.equal(expired.items[0]!.basePrice, 99);
    assert.equal(expired.overlay.lines.length, 0);

    const exhausted = flashOffer({ budgetTotal: 90, budgetUsed: 90 });
    assert.equal(platformOfferBudgetAvailable(exhausted), false);
    const budgeted = applyFoodFlashSaleOverlayToItems({
      items: [item()],
      ctx,
      dataset: dataset([exhausted]),
    });
    assert.equal(budgeted.overlay.lines.length, 0);
    assert.equal(platformOfferEligible(ctx, exhausted, 99), false);
  });

  it("keeps merchant discounted CTM when overlaying flash on a Boost line", () => {
    const merged = mergeFlashSaleSnapshot(
      {
        discounted_ctm_unit: 70,
        discounted_ctm_line: 70,
        customer_item_price_unit: 99,
        customer_item_price_line: 99,
        merchant_offer_type: "PERCENTAGE",
      },
      {
        offerId: 7,
        originalCustomerUnit: 99,
        flashUnit: 9,
        quantity: 1,
        subsidyLine: 90,
      }
    );
    assert.equal(merged.discounted_ctm_unit, 70);
    assert.equal(merged.customer_item_price_unit, 9);
    assert.equal((merged.flash_sale as { subsidy_unit: number }).subsidy_unit, 90);
  });

  it("recovers original unit when menu overlay already baked flash into customer_item_price_unit", () => {
    const ctx = baseCtx({ itemSubtotal: 27 });
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [
        item({
          quantity: 3,
          basePrice: 9,
          itemSnapshot: {
            flash_sale: {
              offer_id: 7,
              original_customer_unit: 99,
              flash_price: 9,
              max_flash_quantity: 1,
            },
            customer_strike_price: 99,
            canonical_pricing: {
              customer_item_price_unit: 9,
              customer_item_price_line: 9,
              customer_strike_unit: 99,
              flash_sale: {
                offer_id: 7,
                original_customer_unit: 99,
                flash_price: 9,
                max_flash_quantity: 1,
              },
            },
          },
        }),
      ],
      ctx,
      dataset: dataset([flashOffer()]),
    });
    assert.equal(applied.qtyExceeded, null);
    assert.equal(applied.overlay.lines[0]!.quantity, 1);
    assert.equal(applied.overlay.subsidyTotal, 90);
    // (9*1 + 99*2) / 3 = 69
    assert.equal(applied.items[0]!.basePrice, 69);
    const flashMeta = (applied.items[0]!.itemSnapshot as { flash_sale?: Record<string, unknown> })
      .flash_sale;
    assert.equal(flashMeta?.flash_sale_quantity, 1);
    assert.equal(flashMeta?.regular_quantity, 2);
    assert.equal(flashMeta?.line_total, 207);
  });

  it("only reopens the unique slot when restore flags allow cancel/refund", () => {
    assert.equal(
      shouldRestoreFlashSaleRedemption({
        nextStatus: "cancelled",
        restoreOnCancel: true,
        restoreOnRefund: true,
      }),
      true
    );
    assert.equal(
      shouldRestoreFlashSaleRedemption({
        nextStatus: "cancelled",
        restoreOnCancel: false,
        restoreOnRefund: true,
      }),
      false
    );
    assert.equal(
      shouldRestoreFlashSaleRedemption({
        nextStatus: "refunded",
        restoreOnCancel: true,
        restoreOnRefund: false,
      }),
      false
    );
  });

  it("does not overlay OOS, locked, disabled, or wrong-store items", () => {
    const offer = flashOffer();
    const oos = [{ id: 10, selling_price: "99.00", in_stock: false }];
    overlayFlashSaleOnMenuRows(oos, [offer]);
    assert.equal(oos[0]!.selling_price, "99.00");

    const locked = [{ id: 10, selling_price: "99.00", is_locked_by_plan: true }];
    overlayFlashSaleOnMenuRows(locked, [offer]);
    assert.equal(locked[0]!.selling_price, "99.00");

    const disabled = [{ id: 10, selling_price: "99.00", is_active: false }];
    overlayFlashSaleOnMenuRows(disabled, [offer]);
    assert.equal(disabled[0]!.selling_price, "99.00");

    const otherItem = [{ id: 99, selling_price: "99.00" }];
    overlayFlashSaleOnMenuRows(otherItem, [offer]);
    assert.equal(otherItem[0]!.selling_price, "99.00");
  });

  it("checkout overlay skips FLASH_SALE targeted at a different store", () => {
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [item()],
      ctx: baseCtx({ merchantStoreId: 42 }),
      dataset: dataset([flashOffer({ merchantIds: [99] })]),
    });
    assert.equal(applied.items[0]!.basePrice, 99);
    assert.equal(applied.overlay.lines.length, 0);
  });

  it("checkout overlay applies MERCHANT FLASH_SALE without geo bindings", () => {
    const applied = applyFoodFlashSaleOverlayToItems({
      items: [
        item({
          itemSnapshot: {
            canonical_pricing: { customer_item_price_unit: 99, customer_item_price_line: 99 },
          },
        }),
      ],
      ctx: baseCtx({ platformOfferGeoBindingEffectiveIds: new Set() }),
      dataset: dataset([flashOffer()]),
    });
    assert.equal(applied.items[0]!.basePrice, 9);
    assert.equal(applied.overlay.subsidyTotal, 90);
    assert.equal(applied.overlay.offerIds[0], 7);
  });
});
