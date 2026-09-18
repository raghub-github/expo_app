import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  flashSaleSubsidyFromBilling,
  orderDiscountGrantedSummaryFromBilling,
  payableCustomerDiscountLinesFromBilling,
} from "../merchant-billing-discount";
import { buildOrderPricingSummary } from "../orderItemsPayload";

describe("CTC bill payable discounts", () => {
  const snap = {
    item_total: 11,
    addon_total: 0,
    packaging_fee: 3,
    platform_fee: 2,
    delivery_fee: 34.71,
    deliveryFeeBeforeBenefitsInr: 74.21,
    deliveryFeeWaivedInr: 36.5,
    tax_total: 7.31,
    discount_total: 36.5,
    final_amount: 58.02,
    grand_total: 58.02,
    discounts: [
      {
        kind: "discount",
        label: "Flash Sale",
        amount: 58.41,
        hidden: true,
        meta: {
          flashSale: true,
          doesNotReducePayable: true,
          platformOfferId: 1,
          fundingMode: "PLATFORM_ONLY",
        },
      },
      {
        kind: "discount",
        label: "GMitra Plus free delivery (5 km covered)",
        amount: 36.5,
        meta: {
          source: "customer_subscription_free_delivery",
          partial: true,
          membershipDeliveryFeeInr: 34.71,
        },
      },
    ],
    order_line_pricing: [
      {
        offerDiscountAmount: 0,
        canonical_pricing: {
          customer_strike_line: 69.41,
          customer_item_price_line: 11,
        },
      },
    ],
  } as Record<string, unknown>;

  it("excludes Flash Sale + free delivery from payable CTC lines", () => {
    const payable = payableCustomerDiscountLinesFromBilling(snap);
    assert.equal(payable.length, 0);
  });

  it("counts Flash Sale subsidy once for granted total", () => {
    assert.equal(flashSaleSubsidyFromBilling(snap), 58.41);
    const granted = orderDiscountGrantedSummaryFromBilling(snap);
    // 58.41 flash (once) + 36.50 free delivery — no baked double-count
    assert.equal(granted.amount, 94.91);
    assert.equal(granted.offerSource, "Platform");
  });

  it("does not invent Additional charge when CTC already nets benefits", () => {
    const pricing = buildOrderPricingSummary(snap, {
      grand_total: 58.02,
      item_total: 11,
    });
    assert.equal(pricing.totalOrderAmount, 58.02);
    const labels = pricing.lines.map((l) => l.label);
    assert.ok(!labels.includes("Additional charge"));
    assert.ok(!labels.some((l) => /flash sale/i.test(l)));
    assert.ok(!labels.some((l) => /free delivery/i.test(l)));
    assert.equal(pricing.discount, 94.91);

    const sum = pricing.lines.reduce(
      (s, l) => (l.kind === "discount" ? s - l.amount : s + l.amount),
      0,
    );
    assert.ok(Math.abs(sum - 58.02) < 0.02);
  });
});
