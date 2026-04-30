/**
 * Unit tests for the payment lifecycle helpers added in 0198:
 *   - markPendingOrderFailedFromWebhook (handles payment.failed)
 *   - applyRefundWebhook                 (handles refund.created/processed/failed)
 *
 * We stub a tiny Drizzle-shaped tx that records every call and lets our
 * chainable `select/from/where/limit` / `update/set/where` / `insert/values`
 * produce controllable rows. This is deliberately minimal — we want to lock
 * in behaviour of the state-machine branches without standing up a real DB.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  applyRefundWebhook,
  markPendingOrderFailedFromWebhook,
  PENDING_PAYMENT_STATES,
} from "./order.placement.service.js";

type PendingRow = {
  pendingId: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  paymentState: string;
  finalizedOrderId: string | null;
  grandTotal: string | number;
  currency: string | null;
  lastGatewayPayload: unknown;
  refundStatus: string | null;
  refundReference: string | null;
};

type Recorded = {
  selects: Array<{ filter: unknown }>;
  updates: Array<Record<string, unknown>>;
  inserts: Array<Array<Record<string, unknown>>>;
};

function makeDb(initialRow: PendingRow | null) {
  const rec: Recorded = { selects: [], updates: [], inserts: [] };

  const db = {
    select: () => ({
      from: () => ({
        where: (filter: unknown) => ({
          limit: async (_n: number) => {
            rec.selects.push({ filter });
            return initialRow ? [initialRow] : [];
          },
        }),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: async (_w: unknown) => {
          rec.updates.push(patch);
          // Reflect the patch into our in-memory row so subsequent asserts see
          // the committed state (tests that re-select would observe this).
          if (initialRow) {
            Object.assign(initialRow, patch);
          }
        },
      }),
    }),
    insert: () => ({
      values: async (rows: Array<Record<string, unknown>> | Record<string, unknown>) => {
        rec.inserts.push(Array.isArray(rows) ? rows : [rows]);
      },
    }),
  } as unknown as PostgresJsDatabase<Record<string, unknown>>;

  return { db, rec };
}

describe("markPendingOrderFailedFromWebhook", () => {
  it("flips a pending_confirmation row to FAILED with failure metadata", async () => {
    const row: PendingRow = {
      pendingId: "pend_1",
      razorpayOrderId: "order_1",
      razorpayPaymentId: null,
      paymentState: PENDING_PAYMENT_STATES.PENDING_CONFIRMATION,
      finalizedOrderId: null,
      grandTotal: "250.00",
      currency: "INR",
      lastGatewayPayload: null,
      refundStatus: null,
      refundReference: null,
    };
    const { db, rec } = makeDb(row);

    const result = await markPendingOrderFailedFromWebhook(db, {
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_999",
      failureCode: "BAD_REQUEST_ERROR",
      failureMessage: "Payment method declined by bank",
      gatewayPayload: { event: "payment.failed" },
    });

    assert.deepEqual(result, { ok: true, pendingId: "pend_1" });
    // One update on pending_orders + one insert into payment_events.
    assert.equal(rec.updates.length, 1);
    assert.equal(rec.updates[0].paymentState, PENDING_PAYMENT_STATES.FAILED);
    assert.equal(rec.updates[0].paymentFailureCode, "BAD_REQUEST_ERROR");
    assert.equal(rec.updates[0].paymentFailureMessage, "Payment method declined by bank");
    assert.equal(rec.updates[0].razorpayPaymentId, "pay_999");

    assert.equal(rec.inserts.length, 1);
    const auditRow = rec.inserts[0][0];
    assert.equal(auditRow.eventType, "WEBHOOK_PAYMENT_FAILED");
    assert.equal(auditRow.source, "webhook");
    assert.equal(auditRow.newState, PENDING_PAYMENT_STATES.FAILED);
    assert.equal(auditRow.failureCode, "BAD_REQUEST_ERROR");
  });

  it("does not regress a finalized row (idempotent vs. reordered events)", async () => {
    const row: PendingRow = {
      pendingId: "pend_2",
      razorpayOrderId: "order_2",
      razorpayPaymentId: "pay_ok",
      paymentState: PENDING_PAYMENT_STATES.FINALIZED,
      finalizedOrderId: "GM10000500",
      grandTotal: "500.00",
      currency: "INR",
      lastGatewayPayload: null,
      refundStatus: null,
      refundReference: null,
    };
    const { db, rec } = makeDb(row);

    const result = await markPendingOrderFailedFromWebhook(db, {
      razorpayOrderId: "order_2",
      failureCode: "X",
      failureMessage: "Y",
    });

    assert.deepEqual(result, { ok: true, pendingId: "pend_2" });
    // No update to pending_orders — just an audit insert.
    assert.equal(rec.updates.length, 0);
    assert.equal(rec.inserts.length, 1);
    assert.equal(rec.inserts[0][0].eventType, "WEBHOOK_FAILED_IGNORED_ALREADY_FINALIZED");
  });

  it("returns NOT_FOUND when no pending matches the order id", async () => {
    const { db } = makeDb(null);
    const result = await markPendingOrderFailedFromWebhook(db, {
      razorpayOrderId: "order_ghost",
      failureCode: "X",
      failureMessage: "Y",
    });
    assert.deepEqual(result, { ok: false, code: "PENDING_ORDER_NOT_FOUND" });
  });
});

describe("applyRefundWebhook", () => {
  it("refund.processed → sets REFUNDED and refund_status='refunded'", async () => {
    const row: PendingRow = {
      pendingId: "pend_3",
      razorpayOrderId: "order_3",
      razorpayPaymentId: "pay_3",
      paymentState: PENDING_PAYMENT_STATES.REFUND_PENDING,
      finalizedOrderId: null,
      grandTotal: "100.00",
      currency: "INR",
      lastGatewayPayload: null,
      refundStatus: "refund_pending",
      refundReference: "rfnd_abc",
    };
    const { db, rec } = makeDb(row);

    const result = await applyRefundWebhook(db, {
      eventType: "refund.processed",
      razorpayPaymentId: "pay_3",
      refundId: "rfnd_abc",
      refundStatus: "processed",
    });

    assert.deepEqual(result, { ok: true, pendingId: "pend_3" });
    assert.equal(rec.updates[0].paymentState, PENDING_PAYMENT_STATES.REFUNDED);
    assert.equal(rec.updates[0].refundStatus, "refunded");
    assert.equal(rec.inserts[0][0].eventType, "REFUND_PROCESSED");
  });

  it("refund.failed → keeps REFUND_PENDING but flips refund_status to refund_failed", async () => {
    const row: PendingRow = {
      pendingId: "pend_4",
      razorpayOrderId: "order_4",
      razorpayPaymentId: "pay_4",
      paymentState: PENDING_PAYMENT_STATES.REFUND_PENDING,
      finalizedOrderId: null,
      grandTotal: "75.00",
      currency: "INR",
      lastGatewayPayload: null,
      refundStatus: "refund_pending",
      refundReference: "rfnd_x",
    };
    const { db, rec } = makeDb(row);

    await applyRefundWebhook(db, {
      eventType: "refund.failed",
      razorpayPaymentId: "pay_4",
      refundId: "rfnd_x",
    });

    assert.equal(rec.updates[0].paymentState, PENDING_PAYMENT_STATES.REFUND_PENDING);
    assert.equal(rec.updates[0].refundStatus, "refund_failed");
    assert.equal(rec.inserts[0][0].eventType, "REFUND_FAILED_WEBHOOK");
  });

  it("refund.created → REFUND_PENDING with refund_status preserved/defaulted", async () => {
    const row: PendingRow = {
      pendingId: "pend_5",
      razorpayOrderId: "order_5",
      razorpayPaymentId: "pay_5",
      paymentState: PENDING_PAYMENT_STATES.PAID,
      finalizedOrderId: "GM10000999",
      grandTotal: "125.00",
      currency: "INR",
      lastGatewayPayload: null,
      refundStatus: null,
      refundReference: null,
    };
    const { db, rec } = makeDb(row);

    await applyRefundWebhook(db, {
      eventType: "refund.created",
      razorpayPaymentId: "pay_5",
      refundId: "rfnd_new",
    });

    assert.equal(rec.updates[0].paymentState, PENDING_PAYMENT_STATES.REFUND_PENDING);
    assert.equal(rec.updates[0].refundStatus, "refund_pending");
    assert.equal(rec.inserts[0][0].eventType, "REFUND_CREATED");
  });
});
