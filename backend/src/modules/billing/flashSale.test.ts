import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFlashSaleSaveDefaults,
  computeFlashSaleSubsidy,
  flashPriceForMenuItem,
  overlayFlashCustomerUnit,
  parseFlashSaleItems,
  parseMaxFlashQuantity,
  resolveMaxFlashQuantity,
  validateFlashSalePrice,
  validateFoodFlashSaleConfig,
  validateMaxFlashQuantity,
  flashSaleBudgetRemaining,
  flashSaleRemainingRedemptions,
  menuRowEligibleForFlashOverlay,
  flashSaleQtyExceededMessage,
} from "./flashSale.js";

describe("FLASH_SALE config and overlay math", () => {
  it("parses per-item flash prices and never accepts a negative price", () => {
    const items = parseFlashSaleItems({
      menu_item_ids: ["10", "11"],
      flash_sale_items: [
        { menu_item_id: "10", flash_price: 9 },
        { menu_item_id: "11", flash_price: 19 },
      ],
    });
    assert.equal(items.length, 2);
    assert.equal(flashPriceForMenuItem(items, 10), 9);
    assert.equal(flashPriceForMenuItem(items, "11"), 19);
    assert.equal(validateFlashSalePrice(-1), "Flash Sale price cannot be negative.");
    assert.equal(validateFlashSalePrice(9, 99), null);
    assert.ok(validateFlashSalePrice(99, 99));
  });

  it("₹99 → ₹9 overlay: customer unit ₹9, subsidy ₹90, catalogue unit untouched", () => {
    const original = 99;
    const overlay = overlayFlashCustomerUnit(original, 9);
    assert.deepEqual(overlay, { unit: 9, subsidyUnit: 90 });
    assert.equal(computeFlashSaleSubsidy(99, 9, 1), 90);
    assert.equal(computeFlashSaleSubsidy(99, 9, 3), 270);
    assert.equal(original, 99);
    assert.equal(overlayFlashCustomerUnit(99, 99), null);
    assert.equal(overlayFlashCustomerUnit(99, 120), null);
  });

  it("max_flash_quantity is read from stored offer conditions (not a hardcoded cap)", () => {
    assert.ok(Number.isNaN(parseMaxFlashQuantity(undefined)));
    assert.ok(Number.isNaN(parseMaxFlashQuantity(null)));
    assert.ok(Number.isNaN(parseMaxFlashQuantity("")));
    assert.equal(parseMaxFlashQuantity(1), 1);
    assert.equal(parseMaxFlashQuantity(5), 5);
    assert.ok(Number.isNaN(parseMaxFlashQuantity(0)));
    assert.ok(Number.isNaN(parseMaxFlashQuantity(-1)));
    assert.ok(Number.isNaN(parseMaxFlashQuantity(1.5)));
    assert.ok(Number.isNaN(parseMaxFlashQuantity("abc")));
    assert.equal(validateMaxFlashQuantity(0), "Max Flash Quantity must be a whole number of at least 1.");
    assert.equal(validateMaxFlashQuantity(1.5), "Max Flash Quantity must be a whole number of at least 1.");
    assert.equal(validateMaxFlashQuantity("abc"), "Max Flash Quantity must be a whole number of at least 1.");
    assert.equal(validateMaxFlashQuantity(1), null);
    assert.equal(resolveMaxFlashQuantity({}), 1);
    assert.equal(resolveMaxFlashQuantity({ max_flash_quantity: 5 }), 5);
    assert.equal(resolveMaxFlashQuantity({ max_flash_quantity: 3 }), 3);
    assert.equal(
      flashSaleQtyExceededMessage(1),
      "Maximum 1 quantity allowed for this Flash Sale item."
    );
    assert.equal(
      flashSaleQtyExceededMessage(3),
      "Maximum 3 quantities allowed for this Flash Sale item."
    );
    assert.ok(
      validateFoodFlashSaleConfig({
        merchantIds: [1],
        conditions: { flash_sale_items: [{ menu_item_id: "10", flash_price: 9 }], max_flash_quantity: 0 },
      })
    );
    assert.equal(
      validateFoodFlashSaleConfig({
        merchantIds: [1],
        conditions: { flash_sale_items: [{ menu_item_id: "10", flash_price: 9 }], max_flash_quantity: 3 },
      }),
      null
    );
  });

  it("requires at least one store and at least one priced item", () => {
    assert.ok(validateFoodFlashSaleConfig({ merchantIds: [], conditions: {} }));
    assert.equal(
      validateFoodFlashSaleConfig({
        merchantIds: [1, 2],
        conditions: { flash_sale_items: [{ menu_item_id: "1", flash_price: 9 }] },
      }),
      null
    );
    assert.equal(
      validateFoodFlashSaleConfig({
        merchantIds: [42],
        conditions: { flash_sale_items: [{ menu_item_id: "10", flash_price: 9 }] },
      }),
      null
    );
  });

  it("forces PLATFORM_ONLY funding and one use per customer on save", () => {
    const food = applyFlashSaleSaveDefaults({
      offer_kind: "FLASH_SALE",
      service_type: "FOOD",
      funding_mode: "CO_FUNDED",
      merchant_share_pct: 50,
      max_uses_per_user: 5,
    });
    assert.equal(food.funding_mode, "PLATFORM_ONLY");
    assert.equal(food.platform_share_pct, 100);
    assert.equal(food.merchant_share_pct, 0);
    assert.equal(food.max_uses_per_user, 1);
    assert.equal(food.target_scope, "MERCHANT");
    const ride = applyFlashSaleSaveDefaults({
      offer_kind: "FLASH_SALE",
      service_type: "RIDE",
      promo_config: { promo_type: "PERCENT_OFF" },
    });
    assert.equal((ride.promo_config as { promo_type: string }).promo_type, "PAY_FIXED");
  });

  it("reports remaining budget and remaining redemptions", () => {
    assert.equal(flashSaleBudgetRemaining(1000, 270), 730);
    assert.equal(flashSaleBudgetRemaining(null, 10), null);
    assert.equal(flashSaleRemainingRedemptions(50, 12), 38);
    assert.equal(flashSaleRemainingRedemptions(null, 12), null);
  });

  it("skips overlay on OOS, locked, or disabled menu rows", () => {
    assert.equal(menuRowEligibleForFlashOverlay({}), true);
    assert.equal(menuRowEligibleForFlashOverlay({ in_stock: false }), false);
    assert.equal(menuRowEligibleForFlashOverlay({ is_locked_by_plan: true }), false);
    assert.equal(menuRowEligibleForFlashOverlay({ is_active: false }), false);
    assert.equal(menuRowEligibleForFlashOverlay({ effective_in_stock: false }), false);
  });
});
