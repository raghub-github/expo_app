/**
 * Database operations for order_refunds.
 * Inserts refund records (refund_type enum: full, partial, item, delivery_fee, tip, penalty).
 */

import { randomUUID } from "crypto";
import { getSql } from "../client";
import { pickGatewayRefundId } from "@/lib/orders/refund-log-ids";

export type RefundTypeDb = "full" | "partial" | "item" | "delivery_fee" | "tip" | "penalty";

function mintRefundRrn(): string {
  return `RRN-${randomUUID().toUpperCase()}`;
}

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
  const refundRrn = mintRefundRrn();

  try {
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
        refund_metadata,
        refund_reference
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
        CAST(${metadataJson} AS jsonb),
        ${refundRrn}
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/refund_reference|42703/i.test(msg)) throw e;
  }

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
  /** Executor state: INITIATED | PROCESSING | COMPLETED | FAILED | NOOP. */
  executionStatus: string | null;
  executionRoute: string | null;
  failureReason: string | null;
  /** Customer-facing unique RRN (RRN-{UUID}). */
  refundReference: string | null;
  /** Original GatiCash payment transaction id (GC-{UUID}). */
  originalGatiCashTxnId: string | null;
  /** Razorpay refund id (rfnd_…) when the PG refund succeeded. */
  razorpayRefundId: string | null;
  /** Legacy PG refund id column (fallback). */
  pgRefundId: string | null;
  /** Wallet credit ledger id for GatiCash / wallet refunds. */
  customerWalletLedgerId: number | null;
  /** Source-wise amounts restored (₹). */
  splitWalletAmount: number | null;
  splitRazorpayAmount: number | null;
  customerWalletAmount: number | null;
  refundInitiatedBy: string | null;
  refundInitiatedById: number | null;
  initiatedByEmail: string | null;
  createdAt: Date;
  processedAt: Date | null;
  completedAt: Date | null;
  /** Partial item refunds — from refund_metadata.refundItems. */
  refundMetadata: Record<string, unknown> | null;
}

export async function listOrderRefunds(orderId: number): Promise<OrderRefundListItem[]> {
  const sql = getSql();
  let mapped: OrderRefundListItem[] = [];
  try {
    const rows = await sql`
      SELECT
        r.id,
        r.order_id AS "orderId",
        r.refund_type AS "refundType",
        r.refund_reason AS "refundReason",
        r.refund_description AS "refundDescription",
        r.refund_amount AS "refundAmount",
        r.refund_status AS "refundStatus",
        r.execution_status::text AS "executionStatus",
        r.execution_route::text AS "executionRoute",
        r.failure_reason AS "failureReason",
        r.refund_reference AS "refundReference",
        r.original_gati_cash_txn_id AS "originalGatiCashTxnId",
        r.razorpay_refund_id AS "razorpayRefundId",
        r.pg_refund_id AS "pgRefundId",
        NULLIF(TRIM(r.razorpay_response->>'id'), '') AS "razorpayResponseId",
        r.customer_wallet_ledger_id AS "customerWalletLedgerId",
        r.split_wallet_amount AS "splitWalletAmount",
        r.split_razorpay_amount AS "splitRazorpayAmount",
        r.customer_wallet_amount AS "customerWalletAmount",
        r.refund_initiated_by AS "refundInitiatedBy",
        r.refund_initiated_by_id AS "refundInitiatedById",
        u.email AS "initiatedByEmail",
        r.created_at AS "createdAt",
        r.processed_at AS "processedAt",
        r.completed_at AS "completedAt",
        r.refund_metadata AS "refundMetadata"
      FROM order_refunds r
      LEFT JOIN system_users u ON u.id = r.refund_initiated_by_id
      WHERE r.order_id = ${orderId}
      ORDER BY r.created_at DESC
    `;
    mapped = (rows as Record<string, unknown>[]).map((row) => ({
      ...(row as unknown as OrderRefundListItem),
      razorpayRefundId: pickGatewayRefundId(
        row.razorpayRefundId,
        row.pgRefundId,
        row.razorpayResponseId
      ),
      pgRefundId: pickGatewayRefundId(row.pgRefundId, row.razorpayRefundId, row.razorpayResponseId),
      splitWalletAmount:
        row.splitWalletAmount != null && Number.isFinite(Number(row.splitWalletAmount))
          ? Number(row.splitWalletAmount)
          : null,
      splitRazorpayAmount:
        row.splitRazorpayAmount != null && Number.isFinite(Number(row.splitRazorpayAmount))
          ? Number(row.splitRazorpayAmount)
          : null,
      customerWalletAmount:
        row.customerWalletAmount != null && Number.isFinite(Number(row.customerWalletAmount))
          ? Number(row.customerWalletAmount)
          : null,
      refundMetadata:
        row.refundMetadata && typeof row.refundMetadata === "object"
          ? (row.refundMetadata as Record<string, unknown>)
          : null,
    }));
  } catch (e) {
    // Older DBs may lack razorpay_refund_id / wallet ledger / RRN columns — fall back.
    const msg = e instanceof Error ? e.message : String(e);
    if (
      !/razorpay_refund_id|razorpay_response|customer_wallet_ledger_id|split_wallet|refund_reference|original_gati_cash_txn|42703/i.test(
        msg
      )
    ) {
      throw e;
    }
    const rows = await sql`
      SELECT
        r.id,
        r.order_id AS "orderId",
        r.refund_type AS "refundType",
        r.refund_reason AS "refundReason",
        r.refund_description AS "refundDescription",
        r.refund_amount AS "refundAmount",
        r.refund_status AS "refundStatus",
        r.execution_status::text AS "executionStatus",
        r.execution_route::text AS "executionRoute",
        r.failure_reason AS "failureReason",
        NULL::text AS "refundReference",
        NULL::text AS "originalGatiCashTxnId",
        NULL::text AS "razorpayRefundId",
        r.pg_refund_id AS "pgRefundId",
        NULL::bigint AS "customerWalletLedgerId",
        NULL::numeric AS "splitWalletAmount",
        NULL::numeric AS "splitRazorpayAmount",
        NULL::numeric AS "customerWalletAmount",
        r.refund_initiated_by AS "refundInitiatedBy",
        r.refund_initiated_by_id AS "refundInitiatedById",
        u.email AS "initiatedByEmail",
        r.created_at AS "createdAt",
        r.processed_at AS "processedAt",
        r.completed_at AS "completedAt",
        r.refund_metadata AS "refundMetadata"
      FROM order_refunds r
      LEFT JOIN system_users u ON u.id = r.refund_initiated_by_id
      WHERE r.order_id = ${orderId}
      ORDER BY r.created_at DESC
    `;
    mapped = (rows as Record<string, unknown>[]).map((row) => ({
      ...(row as unknown as OrderRefundListItem),
      refundReference: null,
      originalGatiCashTxnId: null,
      razorpayRefundId: pickGatewayRefundId(row.razorpayRefundId, row.pgRefundId),
      pgRefundId: pickGatewayRefundId(row.pgRefundId, row.razorpayRefundId),
      splitWalletAmount: null,
      splitRazorpayAmount: null,
      customerWalletAmount: null,
      refundMetadata:
        row.refundMetadata && typeof row.refundMetadata === "object"
          ? (row.refundMetadata as Record<string, unknown>)
          : null,
    }));
  }

  try {
    const { listRefundItemsByRefundIds } = await import("./order-refund-items");
    const byRefund = await listRefundItemsByRefundIds(mapped.map((r) => r.id));
    for (const refund of mapped) {
      const lines = byRefund.get(refund.id);
      if (!lines?.length) continue;
      refund.refundMetadata = {
        ...(refund.refundMetadata ?? {}),
        refundItems: lines.map((l) => ({
          id: l.orderItemId,
          name: l.itemName,
          amount: l.refundAmount,
          refundPercentage: l.refundPercentage,
          originalTotal: l.originalTotal,
          selectedQuantity: l.selectedQuantity,
        })),
      };
    }
  } catch {
    /* order_refund_items may not exist until migration */
  }

  return mapped;
}
