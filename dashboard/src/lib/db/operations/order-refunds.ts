/**
 * Database operations for order_refunds.
 * Inserts refund records (refund_type enum: full, partial, item, delivery_fee, tip, penalty).
 */

import { getSql } from "../client";

export type RefundTypeDb = "full" | "partial" | "item" | "delivery_fee" | "tip" | "penalty";

export interface CreateOrderRefundInput {
  orderId: number;
  orderPaymentId?: number | null;
  refundType: RefundTypeDb;
  refundReason: string;
  refundDescription?: string | null;
  refundAmount: number;
  refundFee?: number | null;
  netRefundAmount?: number | null;
  productType?: string | null;
  mxDebitAmount?: number | null;
  mxDebitReason?: string | null;
  refundInitiatedBy?: string | null;
  refundInitiatedById?: number | null;
  refundMetadata?: Record<string, unknown>;
}

export interface OrderRefundRecord {
  id: number;
  orderId: number;
  orderPaymentId: number | null;
  refundType: string;
  refundReason: string;
  refundDescription: string | null;
  refundAmount: string;
  refundFee: string | null;
  netRefundAmount: string | null;
  refundStatus: string | null;
  refundInitiatedBy: string | null;
  refundInitiatedById: number | null;
  mxDebitAmount: string | null;
  mxDebitReason: string | null;
  createdAt: Date;
}

export async function createOrderRefund(
  input: CreateOrderRefundInput
): Promise<OrderRefundRecord> {
  const sql = getSql();

  const metadataJson = JSON.stringify(input.refundMetadata ?? {});

  const [row] = await sql`
    INSERT INTO order_refunds (
      order_id,
      order_payment_id,
      refund_type,
      refund_reason,
      refund_description,
      refund_amount,
      refund_fee,
      net_refund_amount,
      product_type,
      mx_debit_amount,
      mx_debit_reason,
      refund_status,
      refund_initiated_by,
      refund_initiated_by_id,
      refund_metadata
    )
    VALUES (
      ${input.orderId},
      ${input.orderPaymentId ?? null},
      ${input.refundType}::refund_type,
      ${input.refundReason},
      ${input.refundDescription ?? null},
      ${input.refundAmount},
      ${input.refundFee ?? 0},
      ${input.netRefundAmount ?? input.refundAmount},
      ${input.productType ?? "order"},
      ${input.mxDebitAmount ?? 0},
      ${input.mxDebitReason ?? null},
      'pending',
      ${input.refundInitiatedBy ?? "agent"},
      ${input.refundInitiatedById ?? null},
      CAST(${metadataJson} AS jsonb)
    )
    RETURNING
      id,
      order_id AS "orderId",
      order_payment_id AS "orderPaymentId",
      refund_type AS "refundType",
      refund_reason AS "refundReason",
      refund_description AS "refundDescription",
      refund_amount AS "refundAmount",
      refund_fee AS "refundFee",
      net_refund_amount AS "netRefundAmount",
      refund_status AS "refundStatus",
      refund_initiated_by AS "refundInitiatedBy",
      refund_initiated_by_id AS "refundInitiatedById",
      mx_debit_amount AS "mxDebitAmount",
      mx_debit_reason AS "mxDebitReason",
      created_at AS "createdAt"
  `;

  if (!row) {
    throw new Error("Failed to create order refund");
  }

  return row as unknown as OrderRefundRecord;
}

export interface OrderRefundListItem {
  id: number;
  orderId: number;
  refundType: string;
  refundReason: string;
  refundDescription: string | null;
  refundAmount: string;
  refundStatus: string | null;
  refundInitiatedBy: string | null;
  refundInitiatedById: number | null;
  initiatedByEmail: string | null;
  createdAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
}

export async function listOrderRefunds(orderId: number): Promise<OrderRefundListItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT
      r.id,
      r.order_id AS "orderId",
      r.refund_type AS "refundType",
      r.refund_reason AS "refundReason",
      r.refund_description AS "refundDescription",
      r.refund_amount AS "refundAmount",
      r.refund_status AS "refundStatus",
      r.refund_initiated_by AS "refundInitiatedBy",
      r.refund_initiated_by_id AS "refundInitiatedById",
      u.email AS "initiatedByEmail",
      r.created_at AS "createdAt",
      r.processed_at AS "processedAt",
      r.completed_at AS "completedAt"
    FROM order_refunds r
    LEFT JOIN system_users u ON u.id = r.refund_initiated_by_id
    WHERE r.order_id = ${orderId}
    ORDER BY r.created_at DESC
  `;
  return rows as unknown as OrderRefundListItem[];
}
