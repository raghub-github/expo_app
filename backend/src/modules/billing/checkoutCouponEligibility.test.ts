import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateCheckoutCouponEligibility } from "./checkoutCouponEligibility.js";
import type { DiscountRow } from "./types.js";

function coupon(overrides: Partial<DiscountRow> & { couponConfig?: Record<string, unknown> }): DiscountRow {
  return {
    id: 1,
    code: "GATIFIRST",
    discountType: "PERCENTAGE",
    valueNumeric: 35,
    maxDiscountCap: 80,
    usageLimit: null,
    usedCount: 0,
    validFrom: null,
    validUntil: null,
    isActive: true,
    isHidden: false,
    serviceType: "FOOD",
    offerAudience: "CUSTOMER",
    perUserUsageLimit: 1,
    metadata: null,
    couponConfig: {
      auto_apply: false,
      customer_segment: "NEW",
      usage_mode: "ONE_TIME_EVER",
      min_order_value: 199,
      ...(overrides.couponConfig ?? {}),
    },
    ...overrides,
  };
}

describe("evaluateCheckoutCouponEligibility", () => {
  it("hides NEW-only coupons for EXISTING customers (hard)", () => {
    const r = evaluateCheckoutCouponEligibility(
      coupon({}),
      { lifetime: 0, day: 0, week: 0, month: 0, year: 0 },
      {
        serviceType: "FOOD",
        userSegment: "EXISTING",
        cartSubtotal: 250,
        customerCompletedOrderCount: 3,
      }
    );
    assert.equal(r.hardEligible, false);
    assert.equal(r.reason, "segment");
  });

  it("shows NEW-only coupons for NEW customers when cart meets min", () => {
    const r = evaluateCheckoutCouponEligibility(
      coupon({}),
      { lifetime: 0, day: 0, week: 0, month: 0, year: 0 },
      {
        serviceType: "FOOD",
        userSegment: "NEW",
        cartSubtotal: 250,
        customerCompletedOrderCount: 0,
      }
    );
    assert.equal(r.hardEligible, true);
    assert.equal(r.fullyEligible, true);
  });

  it("lists but does not fully qualify when under min order", () => {
    const r = evaluateCheckoutCouponEligibility(
      coupon({}),
      { lifetime: 0, day: 0, week: 0, month: 0, year: 0 },
      {
        serviceType: "FOOD",
        userSegment: "NEW",
        cartSubtotal: 59,
        customerCompletedOrderCount: 0,
      }
    );
    assert.equal(r.hardEligible, true);
    assert.equal(r.fullyEligible, false);
    assert.equal(r.reason, "min_order");
  });

  it("hides after ONE_TIME_EVER usage", () => {
    const r = evaluateCheckoutCouponEligibility(
      coupon({}),
      { lifetime: 1, day: 0, week: 0, month: 0, year: 0 },
      {
        serviceType: "FOOD",
        userSegment: "NEW",
        cartSubtotal: 250,
        customerCompletedOrderCount: 0,
      }
    );
    assert.equal(r.hardEligible, false);
    assert.equal(r.reason, "usage");
  });

  it("hides FIRST_ORDER_ONLY after a delivered order", () => {
    const r = evaluateCheckoutCouponEligibility(
      coupon({
        couponConfig: {
          customer_segment: "ALL",
          usage_mode: "FIRST_ORDER_ONLY",
          min_order_value: 100,
        },
      }),
      { lifetime: 0, day: 0, week: 0, month: 0, year: 0 },
      {
        serviceType: "FOOD",
        userSegment: "EXISTING",
        cartSubtotal: 250,
        customerCompletedOrderCount: 1,
      }
    );
    assert.equal(r.hardEligible, false);
    assert.equal(r.reason, "usage");
  });
});
