import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyGatewayPayments, resolveGatewayTruth } from "./gateway-truth.js";

test("classifyGatewayPayments: captured with matching amount → CAPTURED", () => {
  const t = classifyGatewayPayments(
    [{ id: "pay_1", status: "captured", amount: 15000 }],
    { expectedPaise: 15000 }
  );
  assert.equal(t.state, "CAPTURED");
  if (t.state === "CAPTURED") {
    assert.equal(t.paymentId, "pay_1");
    assert.equal(t.paidPaise, 15000);
  }
});

test("classifyGatewayPayments: captured wins over an earlier failed attempt", () => {
  const t = classifyGatewayPayments(
    [
      { id: "pay_fail", status: "failed", amount: 15000 },
      { id: "pay_ok", status: "captured", amount: 15000 },
    ],
    { expectedPaise: 15000 }
  );
  assert.equal(t.state, "CAPTURED");
  if (t.state === "CAPTURED") assert.equal(t.paymentId, "pay_ok");
});

test("classifyGatewayPayments: captured but wrong amount → AMOUNT_MISMATCH", () => {
  const t = classifyGatewayPayments(
    [{ id: "pay_1", status: "captured", amount: 9900 }],
    { expectedPaise: 15000 }
  );
  assert.equal(t.state, "AMOUNT_MISMATCH");
  if (t.state === "AMOUNT_MISMATCH") {
    assert.equal(t.paidPaise, 9900);
    assert.equal(t.expectedPaise, 15000);
  }
});

test("classifyGatewayPayments: amount tolerance is honored", () => {
  const t = classifyGatewayPayments(
    [{ id: "pay_1", status: "captured", amount: 15001 }],
    { expectedPaise: 15000, amountTolerancePaise: 2 }
  );
  assert.equal(t.state, "CAPTURED");
});

test("classifyGatewayPayments: only authorized/created → PENDING (never fail)", () => {
  assert.equal(
    classifyGatewayPayments([{ id: "p", status: "authorized", amount: 15000 }]).state,
    "PENDING"
  );
  assert.equal(
    classifyGatewayPayments([{ id: "p", status: "created", amount: 15000 }]).state,
    "PENDING"
  );
});

test("classifyGatewayPayments: empty / only-failed → NONE (safe to fail)", () => {
  assert.equal(classifyGatewayPayments([]).state, "NONE");
  assert.equal(
    classifyGatewayPayments([{ id: "p", status: "failed", amount: 15000 }]).state,
    "NONE"
  );
});

test("resolveGatewayTruth: missing order id → UNREACHABLE (never NONE/FAILED)", async () => {
  const t = await resolveGatewayTruth({ orderId: "" });
  assert.equal(t.state, "UNREACHABLE");
});

test("resolveGatewayTruth: gateway fetch throwing → UNREACHABLE, not a thrown error", async (t) => {
  // Mock the Razorpay fetch to simulate a transient network failure.
  t.mock.module("../../services/payment/razorpayService.js", {
    namedExports: {
      fetchRazorpayOrderPayments: async () => {
        throw new Error("ETIMEDOUT connect");
      },
    },
  });
  const { resolveGatewayTruth: freshResolve } = await import(
    `./gateway-truth.js?bust=${Date.now()}`
  );
  const res = await freshResolve({ orderId: "order_live_1", expectedPaise: 15000 });
  assert.equal(res.state, "UNREACHABLE");
  if (res.state === "UNREACHABLE") assert.match(res.reason, /ETIMEDOUT/);
});
