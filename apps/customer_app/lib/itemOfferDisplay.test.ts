import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildItemOfferDisplayMap,
  computeFlashSaleSplitPricing,
  flashSaleItemDisplay,
  flashSaleItemQtyLimitMessage,
  parseMenuFlashSale,
  resolveMenuOfferPriceDisplay,
} from "./itemOfferDisplay";

describe("Flash Sale menu display", () => {
  it("strikes the original customer unit and shows the flash price", () => {
    const flash = parseMenuFlashSale({
      flashSale: { offer_id: 7, original_customer_unit: 99, flash_price: 9 },
    });
    assert.ok(flash);
    const display = flashSaleItemDisplay(flash!);
    const view = resolveMenuOfferPriceDisplay({
      sellingPrice: 9,
      basePrice: 99,
      itemOffer: display,
    });
    assert.equal(view.payable, 9);
    assert.equal(view.strike, 99);
    assert.equal(view.showStrike, true);
    assert.equal(display.label, "Flash Sale");
    assert.equal(flash!.maxFlashQuantity, null);
  });

  it("splits flash vs regular when quantity exceeds max_flash_quantity", () => {
    const split = computeFlashSaleSplitPricing({
      quantity: 3,
      flashUnit: 9,
      regularUnit: 99,
      maxFlashQuantity: 1,
    });
    assert.equal(split.flashQty, 1);
    assert.equal(split.regularQty, 2);
    assert.equal(split.lineTotal, 207);
    assert.equal(split.subsidyTotal, 90);
  });

  it("qty within cap is all flash", () => {
    const split = computeFlashSaleSplitPricing({
      quantity: 2,
      flashUnit: 9,
      regularUnit: 99,
      maxFlashQuantity: 3,
    });
    assert.equal(split.flashQty, 2);
    assert.equal(split.regularQty, 0);
    assert.equal(split.lineTotal, 18);
  });

  it("null max treats all units as flash (legacy)", () => {
    const split = computeFlashSaleSplitPricing({
      quantity: 3,
      flashUnit: 9,
      regularUnit: 99,
      maxFlashQuantity: null,
    });
    assert.equal(split.flashQty, 3);
    assert.equal(split.regularQty, 0);
    assert.equal(split.lineTotal, 27);
  });
});

describe("Flash Sale menu display continued", () => {
  it("reads max_flash_quantity from the overlay blob", () => {
    const flash = parseMenuFlashSale({
      flash_sale: { offer_id: 7, original_customer_unit: 99, flash_price: 9, max_flash_quantity: 5 },
    });
    assert.equal(flash?.maxFlashQuantity, 5);
    assert.equal(
      flashSaleItemQtyLimitMessage(5),
      "You can add up to 5 of this item at the Flash Sale price."
    );
    assert.equal(
      flashSaleItemQtyLimitMessage(1),
      "You can add up to 1 of this item at the Flash Sale price."
    );
  });

  it("prefers backend flash overlay over a Boost offer on the same item", () => {
    const map = buildItemOfferDisplayMap(
      [
        {
          id: 3,
          offer_id: "b1",
          title: "Boost",
          offer_type: "PERCENTAGE",
          coupon_code: null,
          auto_apply: true,
          label: "20% off",
          sub_label: "",
          discount_percentage: 20,
          discount_value: null,
          max_discount_amount: null,
          min_order_amount: null,
          menu_item_ids: ["10"],
          conditions_mode: "boost",
          display_surface: "item",
        },
      ],
      [
        {
          id: "sku-10",
          menuItemId: 10,
          price: 9,
          customerStrikePrice: 99,
          flashSale: { offerId: 7, originalCustomerUnit: 99, flashPrice: 9 },
        },
      ]
    );
    const row = map.get("10");
    assert.equal(row?.kind, "flash_sale");
    assert.equal(row?.offerPrice, 9);
    assert.equal(row?.strikePrice, 99);
  });

  it("does not client-estimate Boost when strike is not baked on the menu row", () => {
    const map = buildItemOfferDisplayMap(
      [
        {
          id: 3,
          offer_id: "b1",
          title: "Boost",
          offer_type: "PERCENTAGE",
          coupon_code: null,
          auto_apply: true,
          label: "20% off",
          sub_label: "",
          discount_percentage: 20,
          discount_value: null,
          max_discount_amount: null,
          min_order_amount: null,
          menu_item_ids: ["10"],
          conditions_mode: "boost",
          display_surface: "item",
        },
      ],
      [{ id: "sku-10", menuItemId: 10, price: 100 }]
    );
    assert.equal(map.get("10"), undefined);
    assert.equal(map.get("sku-10"), undefined);
  });

  it("never undercuts baked selling_price when a late offer estimate arrives", () => {
    const view = resolveMenuOfferPriceDisplay({
      sellingPrice: 35,
      basePrice: null,
      itemOffer: {
        offerId: 1,
        kind: "percentage",
        label: "Flash Sale",
        offerPrice: 19,
        strikePrice: 35,
        autoApply: true,
      },
    });
    assert.equal(view.payable, 35);
    assert.equal(view.showStrike, false);
  });

  it("builds flash display from menu alone without waiting for store offers", () => {
    const map = buildItemOfferDisplayMap([], [
      {
        id: "sku-1",
        menuItemId: 1,
        price: 19,
        customerStrikePrice: 35,
        flashSale: { offerId: 9, originalCustomerUnit: 35, flashPrice: 19 },
      },
    ]);
    const row = map.get("1");
    assert.equal(row?.kind, "flash_sale");
    const view = resolveMenuOfferPriceDisplay({
      sellingPrice: 19,
      basePrice: 35,
      itemOffer: row,
    });
    assert.equal(view.payable, 19);
    assert.equal(view.strike, 35);
    assert.equal(view.showStrike, true);
  });
});
