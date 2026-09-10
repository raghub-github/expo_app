import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isIntentionalNoRefundCancel } from "./skip-auto-refund";

describe("isIntentionalNoRefundCancel", () => {
  it("skips when refund_status is no_refund", () => {
    assert.equal(isIntentionalNoRefundCancel({ refundStatus: "no_refund" }), true);
  });

  it("skips cancel_without_refund metadata", () => {
    assert.equal(
      isIntentionalNoRefundCancel({
        metadata: { refundType: "cancel_without_refund", skipAutoRefund: true },
      }),
      true
    );
  });

  it("allows ordinary admin cancel repair candidates", () => {
    assert.equal(
      isIntentionalNoRefundCancel({
        refundStatus: "pending",
        reasonCode: "customer_denying_order",
      }),
      false
    );
  });
});
