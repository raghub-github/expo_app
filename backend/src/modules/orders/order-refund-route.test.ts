import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { chooseRoute } from "./order-refund-executor.js";

function snap(over: Record<string, unknown> = {}) {
  return {
    ordersCorePaymentId: null,
    gateway: "online",
    method: "online",
    razorpayPaymentId: null,
    amount: 57.23,
    customerId: 1,
    orderIdText: "GMP10018",
    grandTotal: 57.23,
    gatiCashUsed: 0,
    gatewayAmount: 0,
    gatiCashTxnId: null,
    orderType: "person_ride",
    paymentStatus: "pending",
    capturedPaymentAmount: 0,
    ...over,
  } as Parameters<typeof chooseRoute>[0];
}

describe("chooseRoute unpaid ride fare", () => {
  it("does not wallet-credit unpaid Online person_ride fare", () => {
    assert.equal(chooseRoute(snap()), "COD_NOOP");
  });

  it("still wallets food prepaid GatiCash", () => {
    assert.equal(
      chooseRoute(
        snap({
          orderType: "food",
          gateway: "gati_cash",
          method: "wallet",
          gatiCashUsed: 210.07,
          amount: 210.07,
          grandTotal: 210.07,
          orderIdText: "GMF1",
        })
      ),
      "WALLET"
    );
  });

  it("razorpay-captures ride fare to RAZORPAY", () => {
    assert.equal(
      chooseRoute(
        snap({
          razorpayPaymentId: "pay_abc123XYZ",
          gateway: "razorpay",
          gatewayAmount: 57.23,
          capturedPaymentAmount: 57.23,
        })
      ),
      "RAZORPAY"
    );
  });
});
