import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isCustomerCancellationActor,
  shouldAutoRefundForCancellationActor,
  resolveCustomerShownRefundAmount,
} from "./auto-refund-on-cancellation.js";

describe("auto-refund actor gates", () => {
  it("treats customer/cx as customer-initiated (no default auto-refund)", () => {
    assert.equal(isCustomerCancellationActor("customer"), true);
    assert.equal(isCustomerCancellationActor("cx"), true);
    assert.equal(shouldAutoRefundForCancellationActor("customer"), false);
  });

  it("auto-refunds merchant/system/rider/admin cancels", () => {
    assert.equal(shouldAutoRefundForCancellationActor("merchant"), true);
    assert.equal(shouldAutoRefundForCancellationActor("store"), true);
    assert.equal(shouldAutoRefundForCancellationActor("system"), true);
    assert.equal(shouldAutoRefundForCancellationActor("rider"), true);
  });
});

describe("resolveCustomerShownRefundAmount", () => {
  it("uses shown refund when the sheet promised money back", () => {
    assert.equal(
      roundShown({
        promisedRefund: true,
        shownAmount: 210.07,
        paidAmount: 210.07,
      }),
      210.07
    );
  });

  it("caps shown amount at captured paid (UPI + GatiCash)", () => {
    assert.equal(
      roundShown({
        promisedRefund: true,
        shownAmount: 500,
        paidAmount: 180.5,
      }),
      180.5
    );
  });

  it("falls back to paid when the sheet promised a refund but shown is missing", () => {
    assert.equal(
      roundShown({
        promisedRefund: true,
        shownAmount: null,
        paidAmount: 99,
      }),
      99
    );
  });

  it("does not invent a refund after accept when the sheet showed zero", () => {
    assert.equal(
      roundShown({
        promisedRefund: false,
        shownAmount: 0,
        paidAmount: 210,
      }),
      0
    );
  });

  it("still moves shown amount when paid lookup failed", () => {
    assert.equal(
      roundShown({
        promisedRefund: false,
        shownAmount: 75,
        paidAmount: 0,
      }),
      75
    );
  });
});

function roundShown(
  input: Parameters<typeof resolveCustomerShownRefundAmount>[0]
): number {
  return resolveCustomerShownRefundAmount(input);
}
