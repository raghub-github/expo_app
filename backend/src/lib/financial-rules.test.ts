import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapActorToTriggeredBy,
  refundFieldsFromEngineResult,
  resolvePaymentCancellationMilestone,
  parseEngineResult,
  buildIdempotencyKey,
} from "@gatimitra/financial-rules";

describe("financial-rules", () => {
  it("maps actors to triggered_by", () => {
    assert.equal(mapActorToTriggeredBy("store"), "MERCHANT");
    assert.equal(mapActorToTriggeredBy("admin"), "ADMIN");
    assert.equal(mapActorToTriggeredBy("system"), "SYSTEM");
  });

  it("resolves pre-accept milestone as ORDER_CREATED", () => {
    const r = resolvePaymentCancellationMilestone({
      previousStatus: "CREATED",
      cancelledByType: "customer",
    });
    assert.equal(r.orderMilestone, "ORDER_CREATED");
    assert.equal(r.cancelledBy, "CUSTOMER");
  });

  it("resolves accepted milestone", () => {
    const r = resolvePaymentCancellationMilestone({
      previousStatus: "ACCEPTED",
      cancelledByType: "customer",
    });
    assert.equal(r.orderMilestone, "ORDER_ACCEPTED");
  });

  it("resolves preparing as MERCHANT_PREPARING (pre-pickup shorthand elsewhere)", () => {
    const r = resolvePaymentCancellationMilestone({
      previousStatus: "PREPARING",
      cancelledByType: "merchant",
    });
    assert.equal(r.orderMilestone, "MERCHANT_PREPARING");
    assert.equal(r.cancelledBy, "MERCHANT");
  });

  it("resolves post-delivery milestone", () => {
    const r = resolvePaymentCancellationMilestone({
      previousStatus: "DELIVERED",
      cancelledByType: "customer",
    });
    assert.equal(r.orderMilestone, "CANCELLED_AFTER_DELIVERED");
  });

  it("extracts refund from engine result", () => {
    const f = refundFieldsFromEngineResult({
      ok: true,
      amounts: { refund: 250 },
    });
    assert.equal(f.refundStatus, "pending");
    assert.equal(f.refundAmount, 250);
  });

  it("approval required status", () => {
    const f = refundFieldsFromEngineResult({
      ok: true,
      execution_status: "APPROVAL_REQUIRED",
      amounts: { refund: 6000 },
    });
    assert.equal(f.refundStatus, "pending_approval");
  });

  it("parses engine result", () => {
    const p = parseEngineResult({
      ok: true,
      rule_code: "TEST",
      amounts: { refund: 100, penalty: 0, compensation: 0, merchant_settlement: 0, rider_settlement: 0 },
    });
    assert.equal(p.applied, true);
    assert.equal(p.amounts?.refund, 100);
  });

  it("builds idempotency key", () => {
    const k = buildIdempotencyKey("gm:cancel", ["GM100", "PRE_PICKUP", "MERCHANT"]);
    assert.match(k, /^gm:cancel:GM100:PRE_PICKUP:MERCHANT$/);
  });
});
