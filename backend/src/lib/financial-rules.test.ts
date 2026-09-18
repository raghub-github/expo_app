import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  mapActorToTriggeredBy,
  refundFieldsFromEngineResult,
  resolvePaymentCancellationMilestone,
  resolvePostCancelAutoRefundPolicy,
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

  it("auto-refunds store cancel when engine is silent", () => {
    const p = resolvePostCancelAutoRefundPolicy({
      actorRole: "store",
      engineRefund: { refundStatus: "no_refund", refundAmount: null },
      orderGross: 119.35,
    });
    assert.equal(p.shouldAutoExecute, true);
    assert.equal(p.executeAmount, null);
    assert.equal(p.refundStatus, "pending");
    assert.equal(p.refundAmountForLedger, 119.35);
  });

  it("honors admin rule refund amount", () => {
    const p = resolvePostCancelAutoRefundPolicy({
      actorRole: "system",
      engineRefund: { refundStatus: "pending", refundAmount: 50 },
      orderGross: 119.35,
      forceCustomerRefundWhenEngineSilent: true,
    });
    assert.equal(p.shouldAutoExecute, true);
    assert.equal(p.executeAmount, 50);
    assert.equal(p.refundAmountForLedger, 50);
  });

  it("does not auto-execute when admin rule needs approval", () => {
    const p = resolvePostCancelAutoRefundPolicy({
      actorRole: "admin",
      engineRefund: { refundStatus: "pending_approval", refundAmount: 80 },
      orderGross: 119.35,
    });
    assert.equal(p.shouldAutoExecute, false);
    assert.equal(p.skipReason, "pending_approval");
    assert.equal(p.refundStatus, "pending_approval");
  });

  it("does not invent refund for silent admin cancel", () => {
    const p = resolvePostCancelAutoRefundPolicy({
      actorRole: "admin",
      engineRefund: { refundStatus: "no_refund", refundAmount: null },
      orderGross: 119.35,
    });
    assert.equal(p.shouldAutoExecute, false);
    assert.equal(p.skipReason, "admin_no_refund");
  });

  it("system force still refunds when engine silent", () => {
    const p = resolvePostCancelAutoRefundPolicy({
      actorRole: "system",
      engineRefund: { refundStatus: "no_refund", refundAmount: null },
      orderGross: 200,
      forceCustomerRefundWhenEngineSilent: true,
    });
    assert.equal(p.shouldAutoExecute, true);
    assert.equal(p.executeAmount, null);
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
