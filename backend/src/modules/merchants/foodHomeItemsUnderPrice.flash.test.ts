import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { overlayFlashSaleOnMenuRows } from "../billing/flashSaleApply.js";
import type { PlatformOfferRow } from "../billing/types.js";

/** Mirrors food-home mapItemRow flash step: payable + strike for classic home cards. */
function applyFlashToHomePrice(
  customerUnit: number,
  menuItemId: number,
  itemId: string,
  flashOffers: PlatformOfferRow[]
): { price: number; basePrice: number | null; flash: boolean } {
  let price = customerUnit;
  let basePrice: number | null = null;
  if (flashOffers.length === 0) return { price, basePrice, flash: false };
  const flashRow = {
    id: menuItemId,
    item_id: itemId,
    selling_price: price.toFixed(2),
    in_stock: true,
    is_active: true,
  };
  overlayFlashSaleOnMenuRows([flashRow], flashOffers);
  const flashUnit = parseFloat(String(flashRow.selling_price));
  const flashBlob = (flashRow as { flash_sale?: Record<string, unknown> }).flash_sale;
  if (
    Number.isFinite(flashUnit) &&
    flashUnit >= 0 &&
    flashUnit < price - 0.0001 &&
    flashBlob &&
    typeof flashBlob === "object"
  ) {
    const original = Number(
      (flashRow as { customer_strike_price?: string }).customer_strike_price ?? price
    );
    basePrice = original > flashUnit ? original : null;
    price = flashUnit;
    return { price, basePrice, flash: true };
  }
  return { price, basePrice, flash: false };
}

const flashOffer = (): PlatformOfferRow =>
  ({
    id: 7,
    name: "Flash",
    couponCode: null,
    promoConfig: {},
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
    budgetTotal: null,
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
      flash_sale_items: [{ menu_item_id: "10", flash_price: 9 }],
    },
  }) as PlatformOfferRow;

describe("food-home FLASH_SALE strike wiring", () => {
  it("rewrites payable to flash price and keeps original as strike", () => {
    const out = applyFlashToHomePrice(99, 10, "SS_FLASH", [flashOffer()]);
    assert.equal(out.flash, true);
    assert.equal(out.price, 9);
    assert.equal(out.basePrice, 99);
  });

  it("leaves non-targeted items unchanged", () => {
    const out = applyFlashToHomePrice(35, 99, "SS_OTHER", [flashOffer()]);
    assert.equal(out.flash, false);
    assert.equal(out.price, 35);
    assert.equal(out.basePrice, null);
  });
});
