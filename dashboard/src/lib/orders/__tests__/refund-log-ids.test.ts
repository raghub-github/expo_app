import test from "node:test";
import assert from "node:assert/strict";
import { pickGatewayRefundId, resolveRefundLogIds, refundInitiatedByLabel } from "../refund-log-ids";

test("pickGatewayRefundId prefers rfnd_ over internal RRN", () => {
  assert.equal(
    pickGatewayRefundId(
      "RRN-D5D1D167-D75D-49E4-A3CF-A9908402F6F7",
      "rfnd_N8abc123",
      "RFND-12"
    ),
    "rfnd_N8abc123"
  );
});

test("pickGatewayRefundId ignores RRN and weak placeholders", () => {
  assert.equal(
    pickGatewayRefundId("RRN-D5D1D167-D75D-49E4-A3CF-A9908402F6F7", "RFND-99"),
    null
  );
});

test("gateway-only refund shows Razorpay id, not RRN", () => {
  const lines = resolveRefundLogIds({
    refundReference: "RRN-D5D1D167-D75D-49E4-A3CF-A9908402F6F7",
    razorpayRefundId: "rfnd_gatewayOnly",
    splitWalletAmount: 0,
    splitRazorpayAmount: 108.05,
    executionRoute: "RAZORPAY",
  });
  assert.deepEqual(
    lines.map((l) => ({ source: l.source, id: l.id })),
    [{ source: "gateway", id: "rfnd_gatewayOnly" }]
  );
});

test("GatiCash-only refund shows internal RRN", () => {
  const lines = resolveRefundLogIds({
    refundReference: "RRN-AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
    customerWalletLedgerId: 44,
    splitWalletAmount: 50,
    splitRazorpayAmount: 0,
    executionRoute: "WALLET",
  });
  assert.deepEqual(
    lines.map((l) => ({ source: l.source, id: l.id })),
    [{ source: "gaticash", id: "RRN-AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" }]
  );
});

test("split UPI + GatiCash shows both ids", () => {
  const lines = resolveRefundLogIds({
    refundReference: "RRN-AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE",
    razorpayRefundId: "rfnd_splitPay",
    customerWalletLedgerId: 9,
    splitWalletAmount: 20,
    splitRazorpayAmount: 80,
    executionRoute: "MIXED",
  });
  assert.deepEqual(
    lines.map((l) => ({ source: l.source, id: l.id })),
    [
      { source: "gaticash", id: "RRN-AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE" },
      { source: "gateway", id: "rfnd_splitPay" },
    ]
  );
});

test("auto-cancel refund initiated by shows Auto - System", () => {
  assert.equal(
    refundInitiatedByLabel({
      refundReason: "Auto Cancelled — MERCHANT_ACCEPT_TIMEOUT",
      refundInitiatedBy: "system",
      initiatedByEmail: null,
    }),
    "Auto - System"
  );
});

test("manual refund initiated by keeps agent email", () => {
  assert.equal(
    refundInitiatedByLabel({
      refundReason: "Customer request",
      refundInitiatedBy: "agent",
      initiatedByEmail: "agent@gatimitra.com",
    }),
    "agent@gatimitra.com"
  );
});

test("auto-cancel with agent email still shows the agent", () => {
  assert.equal(
    refundInitiatedByLabel({
      refundReason: "Auto Cancelled — MERCHANT_ACCEPT_TIMEOUT",
      refundInitiatedBy: "agent",
      initiatedByEmail: "ops@gatimitra.com",
    }),
    "ops@gatimitra.com"
  );
});

test("merchant cancel refund initiated by shows Store", () => {
  assert.equal(
    refundInitiatedByLabel({
      refundReason: "Items out of stock",
      refundInitiatedBy: "merchant",
      initiatedByEmail: null,
    }),
    "Store"
  );
});

test("legacy merchant cancel stamped as system still shows Store", () => {
  assert.equal(
    refundInitiatedByLabel({
      refundReason: "Items out of stock",
      refundInitiatedBy: "system",
      initiatedByEmail: null,
    }),
    "Store"
  );
});
