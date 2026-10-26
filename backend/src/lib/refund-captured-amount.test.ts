import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  customerFareWasCaptured,
  resolveRefundablePaidAmountFromFacts,
} from "./refund-captured-amount.js";

describe("unpaid ride fare is not refundable", () => {
  it("GMP10018-style Online person_ride with no capture returns 0", () => {
    assert.equal(
      resolveRefundablePaidAmountFromFacts({
        grandTotal: 57.23,
        corePaymentMethod: "online",
        corePaymentStatus: "pending",
        capturedPaidAmount: 0,
        paymentGateway: "",
        paymentMethod: "",
        gatiCashFromBreakdown: 0,
        gatewayAmtFromBreakdown: 0,
        pendingGatiCash: 0,
        orderType: "person_ride",
      }),
      0
    );
  });

  it("does not treat ride payment_status PAID as money without a capture row", () => {
    assert.equal(
      resolveRefundablePaidAmountFromFacts({
        grandTotal: 57.23,
        corePaymentMethod: "online",
        corePaymentStatus: "PAID",
        capturedPaidAmount: 0,
        paymentGateway: "online",
        paymentMethod: "online",
        gatiCashFromBreakdown: 0,
        gatewayAmtFromBreakdown: 0,
        pendingGatiCash: 0,
        orderType: "person_ride",
      }),
      0
    );
  });

  it("refunds captured ride fare", () => {
    assert.equal(
      resolveRefundablePaidAmountFromFacts({
        grandTotal: 57.23,
        corePaymentMethod: "online",
        corePaymentStatus: "PAID",
        capturedPaidAmount: 57.23,
        paymentGateway: "razorpay",
        paymentMethod: "upi",
        gatiCashFromBreakdown: 0,
        gatewayAmtFromBreakdown: 57.23,
        pendingGatiCash: 0,
        orderType: "person_ride",
      }),
      57.23
    );
  });

  it("still refunds food prepaid GatiCash from grand_total when no payments row", () => {
    assert.equal(
      resolveRefundablePaidAmountFromFacts({
        grandTotal: 210.07,
        corePaymentMethod: "wallet",
        corePaymentStatus: "PAID",
        capturedPaidAmount: 0,
        paymentGateway: "gati_cash",
        paymentMethod: "wallet",
        gatiCashFromBreakdown: 0,
        gatewayAmtFromBreakdown: 0,
        pendingGatiCash: 210.07,
        orderType: "food",
      }),
      210.07
    );
  });
});

describe("customerFareWasCaptured", () => {
  it("is false for unpaid planned Online fare", () => {
    assert.equal(
      customerFareWasCaptured({
        razorpayPaymentId: null,
        gatiCashTxnId: null,
        gatiCashUsed: 0,
        gatewayAmount: 0,
        capturedPaymentAmount: 0,
      }),
      false
    );
  });
});
