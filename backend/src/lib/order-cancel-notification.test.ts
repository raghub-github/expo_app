import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isOrderCancelRefundEligible,
  resolveCustomerOrderCancelledTemplateCode,
} from "./order-cancel-notification.js";

describe("order-cancel-notification", () => {
  it("uses explicit refundEligible flag", () => {
    assert.equal(isOrderCancelRefundEligible({ refundEligible: true }), true);
    assert.equal(isOrderCancelRefundEligible({ refundEligible: false }), false);
  });

  it("treats positive refund amount as eligible", () => {
    assert.equal(
      isOrderCancelRefundEligible({ refundStatus: "pending", refundAmount: 74.38 }),
      true
    );
    assert.equal(
      resolveCustomerOrderCancelledTemplateCode({
        refundStatus: "pending",
        refundAmount: 74.38,
      }),
      "ORDER_CANCELLED_REFUND_ELIGIBLE"
    );
  });

  it("treats no_refund as not eligible", () => {
    assert.equal(
      isOrderCancelRefundEligible({ refundStatus: "no_refund", refundAmount: null }),
      false
    );
    assert.equal(
      resolveCustomerOrderCancelledTemplateCode({ refundStatus: "no_refund" }),
      "ORDER_CANCELLED_NO_REFUND"
    );
  });
});
