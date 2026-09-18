import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildItemOfferDisplayMap,
  flashSaleItemDisplay,
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
