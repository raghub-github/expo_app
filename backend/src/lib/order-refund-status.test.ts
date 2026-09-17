import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { aggregateCustomerRefundRows } from "./order-refund-status.js";

describe("aggregateCustomerRefundRows", () => {
  it("sums multiple refund slabs and keeps every RRN", () => {
    const summary = aggregateCustomerRefundRows([
      {
        id: 1,
        order_id: 100,
        refund_status: "completed",
        execution_status: "COMPLETED",
        execution_route: "WALLET",
        refund_amount: 71.51,
        refund_reference: "RRN-AAAAAAAA-1111-2222-3333-444444444444",
        razorpay_refund_id: null,
        customer_wallet_ledger_id: 10,
        split_wallet_amount: 71.51,
        split_razorpay_amount: 0,
        created_at: "2026-09-04T16:32:00.000Z",
        executed_at: "2026-09-04T16:32:00.000Z",
        completed_at: "2026-09-04T16:32:00.000Z",
      },
      {
        id: 2,
        order_id: 100,
        refund_status: "completed",
        execution_status: "COMPLETED",
        execution_route: "WALLET",
        refund_amount: 71.5,
        refund_reference: "RRN-5A270454-552E-4879-887B-BF2FF9DD8597",
        razorpay_refund_id: null,
        customer_wallet_ledger_id: 11,
        split_wallet_amount: 71.5,
        split_razorpay_amount: 0,
        created_at: "2026-09-04T17:32:00.000Z",
        executed_at: "2026-09-04T17:32:00.000Z",
        completed_at: "2026-09-04T17:32:00.000Z",
      },
    ]);

    assert.ok(summary);
    assert.equal(summary.amount, 143.01);
    assert.equal(summary.walletAmount, 143.01);
    assert.equal(summary.status, "completed");
    assert.equal(summary.slabs.length, 2);
    assert.deepEqual(summary.references, [
      "RRN-AAAAAAAA-1111-2222-3333-444444444444",
      "RRN-5A270454-552E-4879-887B-BF2FF9DD8597",
    ]);
    assert.equal(summary.reference, "RRN-5A270454-552E-4879-887B-BF2FF9DD8597");
  });

  it("keeps a single-slab refund amount unchanged", () => {
    const summary = aggregateCustomerRefundRows([
      {
        id: 9,
        order_id: 8,
        refund_status: "completed",
        execution_status: "COMPLETED",
        execution_route: "WALLET",
        refund_amount: 71.5,
        refund_reference: "RRN-5A270454-552E-4879-887B-BF2FF9DD8597",
        customer_wallet_ledger_id: 11,
        split_wallet_amount: 71.5,
        created_at: "2026-09-04T17:32:00.000Z",
      },
    ]);
    assert.ok(summary);
    assert.equal(summary.amount, 71.5);
    assert.equal(summary.references.length, 1);
  });

  it("does not duplicate processed/completed when stored timeline already has them", () => {
    const summary = aggregateCustomerRefundRows([
      {
        id: 9,
        order_id: 8,
        refund_status: "completed",
        execution_status: "COMPLETED",
        execution_route: "WALLET",
        refund_amount: 225.59,
        refund_reference: "RRN-FD801E6C-670E-40B9-8139-D48858CE5F5C",
        customer_wallet_ledger_id: 11,
        split_wallet_amount: 225.59,
        created_at: "2026-09-15T09:25:00.000Z",
        executed_at: "2026-09-15T09:25:00.000Z",
        completed_at: "2026-09-15T09:25:00.000Z",
        refund_timeline: [
          {
            key: "initiated",
            label: "Refund initiated for ₹225.59",
            at: "2026-09-15T09:25:00.000Z",
          },
          {
            key: "processed",
            label: "Refund processed",
            at: "2026-09-15T09:25:00.000Z",
          },
          {
            key: "completed",
            label: "Refund completed",
            at: "2026-09-15T09:25:00.000Z",
          },
        ],
      },
    ]);
    assert.ok(summary);
    const keys = summary.timeline.map((s) => s.key);
    assert.deepEqual(keys, ["initiated", "processed", "completed"]);
    assert.equal(summary.timeline.filter((s) => s.key === "processed").length, 1);
    assert.equal(summary.timeline.filter((s) => s.key === "completed").length, 1);
  });
});
