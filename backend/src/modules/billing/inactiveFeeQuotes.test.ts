import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quotesForInactiveFeeRules } from "./inactiveFeeQuotes.js";

describe("quotesForInactiveFeeRules", () => {
  it("quotes a deactivated delivery fee and leaves it out of any payable field", () => {
    const quotes = quotesForInactiveFeeRules({
      rules: [
        {
          type: "DELIVERY",
          serviceType: "FOOD",
          calculationType: "FORMULA_KEY",
          valueNumeric: null,
          valueJson: { key: "DELIVERY_SLABS_GEO_V2" },
        },
      ],
      activeTypes: new Set(["PLATFORM_FEE", "PACKAGING"]),
      serviceType: "FOOD",
      routeDeliveryFeeInr: 74.31,
      itemPlusAddon: 315.29,
      itemPackagingTotal: 8,
      packagingChargeAmount: 0,
      isSelfPickup: false,
    });
    assert.deepEqual(quotes, { delivery: 74.31 });
  });

  it("does not quote a fee type that still has an active rule", () => {
    const quotes = quotesForInactiveFeeRules({
      rules: [
        {
          type: "PLATFORM_FEE",
          serviceType: "FOOD",
          calculationType: "FIXED",
          valueNumeric: 2,
          valueJson: null,
        },
      ],
      activeTypes: new Set(["PLATFORM_FEE"]),
      serviceType: "FOOD",
      routeDeliveryFeeInr: 0,
      itemPlusAddon: 100,
      itemPackagingTotal: 0,
      packagingChargeAmount: 0,
      isSelfPickup: false,
    });
    assert.deepEqual(quotes, {});
  });

  it("quotes inactive packaging from the item total and platform from the fixed value", () => {
    const quotes = quotesForInactiveFeeRules({
      rules: [
        {
          type: "PACKAGING",
          serviceType: "ALL",
          calculationType: "FORMULA_KEY",
          valueNumeric: null,
          valueJson: { key: "MERCHANT_PACKAGING" },
        },
        {
          type: "PLATFORM_FEE",
          serviceType: "FOOD",
          calculationType: "FIXED",
          valueNumeric: 2,
          valueJson: null,
        },
      ],
      activeTypes: new Set(),
      serviceType: "FOOD",
      routeDeliveryFeeInr: 0,
      itemPlusAddon: 200,
      itemPackagingTotal: 8,
      packagingChargeAmount: 0,
      isSelfPickup: true,
    });
    assert.equal(quotes.packaging, 8);
    assert.equal(quotes.platform, 2);
    assert.equal(quotes.delivery, undefined);
  });
});
