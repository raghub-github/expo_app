import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFoodOrderItemsPayload } from "./food-order-payload.js";
import type { NormalizedOrderItem } from "../modules/orders/orderNormalizer.js";

describe("food-order-payload special instructions", () => {
  it("keeps cooking instructions separate from customization text", () => {
    const items: NormalizedOrderItem[] = [
      {
        menuItemId: 101,
        itemName: "Biryani",
        quantity: 1,
        basePrice: 199,
        variantId: null,
        variantKey: null,
        variantName: "Full",
        addons: [],
        specialInstructions: "Less spicy",
        itemSnapshot: {
          customization: "Full",
          item_instructions: "Less spicy",
        },
      },
    ];

    const payload = buildFoodOrderItemsPayload(items);
    assert.equal(payload[0]?.item_instructions, "Less spicy");
    assert.equal(payload[0]?.customization, "Full");
    assert.notEqual(payload[0]?.customization, "Less spicy");
  });
});
