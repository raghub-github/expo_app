import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyFlashSaleSaveDefaults,
  buildFlashSaleConditions,
  computeFlashSaleOffPercent,
  computeFlashSaleSubsidy,
  flashSaleBudgetRemaining,
  flashSaleRemainingRedemptions,
  parseMaxFlashQuantity,
  resolveMaxFlashQuantity,
  validateFlashSalePrice,
  validateMaxFlashQuantity,
} from "./flashSale";

describe("dashboard FLASH_SALE helpers", () => {
  it("computes platform subsidy as original minus flash", () => {
    assert.equal(computeFlashSaleSubsidy(99, 9), 90);
    assert.ok(validateFlashSalePrice(9, 99) == null);
    assert.ok(validateFlashSalePrice(99, 99));
  });

  it("labels percent off from original to flash price", () => {
    assert.equal(computeFlashSaleOffPercent(69, 11), 84);
    assert.equal(computeFlashSaleOffPercent(99, 9), 91);
    assert.equal(computeFlashSaleOffPercent(10, 10), null);
  });

  it("forces PLATFORM_ONLY and one use per customer", () => {
    const next = applyFlashSaleSaveDefaults({
      offer_kind: "FLASH_SALE",
      service_type: "FOOD",
      funding_mode: "CO_FUNDED",
      max_uses_per_user: 4,
    });
    assert.equal(next.funding_mode, "PLATFORM_ONLY");
    assert.equal(next.max_uses_per_user, 1);
    assert.equal(next.target_scope, "MERCHANT");
  });

  it("parses and validates max_flash_quantity", () => {
    assert.ok(Number.isNaN(parseMaxFlashQuantity(undefined)));
    assert.equal(parseMaxFlashQuantity(3), 3);
    assert.ok(Number.isNaN(parseMaxFlashQuantity(0)));
    assert.ok(Number.isNaN(parseMaxFlashQuantity(1.5)));
    assert.equal(validateMaxFlashQuantity("abc"), "Max Flash Quantity must be a whole number of at least 1.");
    assert.equal(resolveMaxFlashQuantity({ max_flash_quantity: 10 }), 10);
    const cond = buildFlashSaleConditions({
      items: [{ menuItemId: "10", flashPrice: 9 }],
      maxFlashQuantity: 2,
    });
    assert.equal(cond.max_flash_quantity, 2);
  });

  it("reports remaining budget and remaining redemptions", () => {
    assert.equal(flashSaleBudgetRemaining("1000", "270"), 730);
    assert.equal(flashSaleBudgetRemaining("", "10"), null);
    assert.equal(flashSaleRemainingRedemptions("20", 7), 13);
    assert.equal(flashSaleRemainingRedemptions("", 7), null);
  });
});
