import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseNativePendingOrderAction } from "./pendingOrderAction";

const base = {
  action: "accept",
  sessionId: "RIDER_NEW_ORDER:ORD9:4:1",
  orderId: "ORD9",
  offerId: "ORD9",
  foodOrderId: "",
  displayOrderId: "GMR000009",
  storeId: "",
  at: 1730000000000,
};

describe("native pending order action", () => {
  it("reads a successful background accept", () => {
    const parsed = parseNativePendingOrderAction(
      JSON.stringify({ ...base, result: "ok", httpStatus: 200 })
    );
    assert.equal(parsed?.result, "ok");
    assert.equal(parsed?.orderId, "ORD9");
    assert.equal(parsed?.httpStatus, 200);
  });

  it("keeps the server's own refusal text", () => {
    const parsed = parseNativePendingOrderAction(
      JSON.stringify({
        ...base,
        result: "failed",
        httpStatus: 409,
        detail: "This order is no longer available.",
      })
    );
    assert.equal(parsed?.result, "failed");
    assert.equal(parsed?.detail, "This order is no longer available.");
  });

  it("treats an in-flight accept as pending, not success", () => {
    const parsed = parseNativePendingOrderAction(JSON.stringify({ ...base, result: "pending" }));
    assert.equal(parsed?.result, "pending");
  });

  it("treats a stash from an older build as pending rather than ok", () => {
    // No `result` key at all — the build that wrote it could not report one.
    const parsed = parseNativePendingOrderAction(JSON.stringify(base));
    assert.equal(parsed?.result, "pending");
    assert.equal(parsed?.httpStatus, 0);
  });

  it("ignores anything that is not an accept or reject", () => {
    assert.equal(parseNativePendingOrderAction(JSON.stringify({ ...base, action: "open" })), null);
    assert.equal(parseNativePendingOrderAction("not json"), null);
    assert.equal(parseNativePendingOrderAction(""), null);
    assert.equal(parseNativePendingOrderAction(null), null);
  });
});
