import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getPlatformOfferKindSections,
  validatePlatformOfferKindFieldsForApi,
} from "./platformOfferKindUi";

describe("FLASH_SALE kind UI", () => {
  it("hides cart, delivery, and BXGY fields only for FLASH_SALE", () => {
    const flash = getPlatformOfferKindSections("FLASH_SALE");
    assert.equal(flash.showCartDiscount, false);
    assert.equal(flash.showDeliveryBlock, false);
    assert.equal(flash.showBuyXGetYFields, false);
    assert.equal(flash.showFlashSaleBuilder, true);

    const discount = getPlatformOfferKindSections("DISCOUNT");
    assert.equal(discount.showCartDiscount, true);
    assert.equal(discount.showFlashSaleBuilder, false);
  });

  it("allows one or many stores with flash items on save", () => {
    const errEmpty = validatePlatformOfferKindFieldsForApi({
      offer_kind: "FLASH_SALE",
      service_type: "FOOD",
      conditions: {},
      merchant_ids: [],
    });
    assert.ok(errEmpty);
    assert.equal(
      validatePlatformOfferKindFieldsForApi({
        offer_kind: "FLASH_SALE",
        service_type: "FOOD",
        conditions: { flash_sale_items: [{ menu_item_id: "10", flash_price: 9 }] },
        merchant_ids: [42],
      }),
      null
    );
    assert.equal(
      validatePlatformOfferKindFieldsForApi({
        offer_kind: "FLASH_SALE",
        service_type: "FOOD",
        conditions: {
          flash_sale_items: [
            { menu_item_id: "10", flash_price: 9, store_id: 42 },
            { menu_item_id: "11", flash_price: 19, store_id: 43 },
          ],
        },
        merchant_ids: [42, 43],
      }),
      null
    );
  });
});
