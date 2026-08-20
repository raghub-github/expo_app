import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  merchantCtmNetSumFromItems,
  merchantNetCtmFromBillingCanonical,
  merchantNotifyItemCount,
  type MerchantOrderItemLike,
} from "./merchant-visible-pricing.js";

describe("merchantCtmNetSumFromItems", () => {
  it("sums discounted MX (net), not original catalog gross", () => {
    const items: MerchantOrderItemLike[] = [
      {
        qty: 1,
        name: "Onian Pizza",
        price: 149,
        catalog_line_total: 149,
        net_line_total: 89.4,
        offer_discount: 59.6,
        ctm_from_snapshot: true,
      },
      {
        qty: 1,
        name: "Plain Chappati",
        price: 15,
        catalog_line_total: 15,
        net_line_total: 15,
        offer_discount: 0,
        ctm_from_snapshot: true,
      },
    ];
    assert.equal(merchantCtmNetSumFromItems(items), 104.4);
  });

  it("falls back to catalog minus offer_discount when net is missing", () => {
    const items: MerchantOrderItemLike[] = [
      {
        qty: 1,
        name: "Pizza",
        price: 149,
        catalog_line_total: 149,
        offer_discount: 59.6,
      },
    ];
    assert.equal(merchantCtmNetSumFromItems(items), 89.4);
  });
});

describe("merchantNetCtmFromBillingCanonical", () => {
  it("sums discounted_ctm_line from billing order_line_pricing", () => {
    const billing = {
      order_line_pricing: [
        { canonical_pricing: { discounted_ctm_line: 89.4 } },
        { canonical_pricing: { discounted_ctm_line: 15 } },
      ],
    };
    assert.equal(merchantNetCtmFromBillingCanonical(billing), 104.4);
  });
});

describe("merchantNotifyItemCount", () => {
  it("sums line quantities", () => {
    assert.equal(
      merchantNotifyItemCount([
        { qty: 1 },
        { qty: 1 },
      ]),
      2
    );
  });
});
