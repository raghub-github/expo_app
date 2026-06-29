/**
 * Customer-initiated food order cancellation — reason tracking + financial rules.
 */

import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "../../db/client.js";
import { customers, ordersCore, ordersFood } from "../../db/schema.js";
import { customerOrderRefWhere } from "../../lib/order-ref-resolve.js";
import { recordOrderCancellation } from "../../lib/record-order-cancellation.js";
import { recordCancellationTimeline } from "../../lib/order-cancellation-timeline.js";
import {
  executeOrderCancellationFinancials,
  lookupOrderContext,
} from "../../lib/financial-rule-executor.js";
import { refundFieldsFromEngineResult } from "../../lib/order-cancellation-refund.js";
import { applyPaymentCancellationPayment } from "../../lib/apply-cancellation-payment.js";
import { applyMerchantOrderCancellationLedger } from "../../lib/apply-merchant-cancellation-ledger.js";
import { completeOrderDispatch } from "../../lib/order-dispatch.service.js";

export const CUSTOMER_FOOD_CANCELLED_BY_LABEL = "Cancelled by me";

const VALID_FOOD_CANCEL_TRANSITIONS: Record<string, string[]> = {
  CREATED: ["CANCELLED"],
  NEW: ["CANCELLED"],
  ACCEPTED: ["CANCELLED"],
  PREPARING: ["CANCELLED"],
  READY_FOR_PICKUP: ["CANCELLED"],
};

function normalizeFoodStatus(raw: string | null | undefined): string {
  let s = String(raw ?? "CREATED").trim().toUpperCase().replace("NEW", "CREATED");
  if (s === "PLACED" || s === "ORDER_RECEIVED" || s === "ORDER_PLACED") s = "CREATED";
  return s;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type CancelFoodOrderInput = {
  customerPk: number;
  orderRef: string;
  reasonCode: string;
  reasonText: string;
};

export async function cancelFoodOrderForCustomer(
  input: CancelFoodOrderInput
): Promise<{ orderId: string; status: string }> {
  const db = getDb();
  const sql = getSql();
  const now = new Date();
  const reasonCode = input.reasonCode.trim().slice(0, 120);
  const reasonText = input.reasonText.trim().slice(0, 500);
  if (!reasonCode || !reasonText) {
    throw Object.assign(new Error("Cancellation reason is required"), { statusCode: 400 });
  }

  const [row] = await db
    .select({
      coreId: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      riderId: ordersCore.riderId,
      grandTotal: ordersCore.grandTotal,
      foodAcceptedAt: ordersFood.acceptedAt,
      ordersFoodId: ordersFood.id,
      foodStatus: ordersFood.orderStatus,
      merchantStoreId: ordersFood.merchantStoreId,
    })
    .from(ordersCore)
    .innerJoin(ordersFood, eq(ordersFood.orderId, ordersCore.id))
    .where(
      and(
        customerOrderRefWhere(input.customerPk, input.orderRef),
        eq(ordersCore.orderType, "food")
      )
    )
    .limit(1);

  if (!row?.coreId || !row.orderId) {
    throw Object.assign(new Error("Order not found"), { statusCode: 404 });
  }

  const foodStatus = normalizeFoodStatus(row.foodStatus);
  if (foodStatus === "CANCELLED") {
    return { orderId: row.orderId, status: "CANCELLED" };
  }
  if (foodStatus === "DELIVERED" || foodStatus === "RTO" || foodStatus === "OUT_FOR_DELIVERY") {
    throw Object.assign(new Error("Order cannot be cancelled in current status"), {
      statusCode: 409,
    });
  }

  const allowed = VALID_FOOD_CANCEL_TRANSITIONS[foodStatus] ?? [];
  if (!allowed.includes("CANCELLED")) {
    throw Object.assign(new Error("Order cannot be cancelled in current status"), {
      statusCode: 409,
    });
  }

  const previousStatus = foodStatus;
  const displayReason = reasonText;
  const orderIdText = row.orderId.trim();
  const riderId = Number(row.riderId ?? 0);

  if (riderId > 0) {
    try {
      const { adminCancelFoodRiderFromOrder } = await import(
        "../../lib/food-rider-unassign.service.js"
      );
      await adminCancelFoodRiderFromOrder({
        orderCorePk: row.coreId,
        orderIdText,
        riderId,
        reasonCode: reasonCode || "CUSTOMER_ORDER_CANCELLED",
        reasonText: displayReason,
        removedBy: "customer",
        actorType: "customer",
        actorId: String(input.customerPk),
        mode: "hold",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/delivered or cancelled/i.test(msg)) {
        console.warn("[cancelFoodOrderForCustomer] rider unassign failed:", err);
      }
    }
  }

  await db
    .update(ordersCore)
    .set({
      status: "cancelled",
      currentStatus: "CANCELLED",
      riderId: null,
      cancelledAt: now,
      cancelledBy: "customer",
      cancelledById: input.customerPk,
      updatedAt: now,
    })
    .where(eq(ordersCore.id, row.coreId));

  await sql`
    UPDATE orders_food
    SET
      order_status = 'CANCELLED',
      cancelled_at = ${now.toISOString()}::timestamptz,
      rejected_reason = ${displayReason},
      cancelled_by_label = ${CUSTOMER_FOOD_CANCELLED_BY_LABEL},
      cancelled_by_type = 'customer',
      rider_id = NULL,
      updated_at = ${now.toISOString()}::timestamptz
    WHERE id = ${row.ordersFoodId}
  `;

  try {
    await completeOrderDispatch(row.coreId, "cancelled");
  } catch {
    /* non-fatal */
  }

  try {
    await recordCancellationTimeline(sql, {
      orderCorePk: row.coreId,
      previousStatus,
      rejectedReason: displayReason,
      actorType: "customer",
      cancelMode: "manual",
      statusMessage: displayReason,
      occurredAt: now,
    });
  } catch {
    /* non-fatal */
  }

  const orderCtx = await lookupOrderContext(row.coreId, sql);
  const engineResult = await executeOrderCancellationFinancials(
    {
      orderCoreId: row.coreId,
      ordersFoodId: row.ordersFoodId,
      coreOrderId: orderCtx.coreOrderId,
      merchantStoreId: orderCtx.merchantStoreId ?? row.merchantStoreId,
      previousStatus,
      cancelledByType: "customer",
      orderGross: num(row.grandTotal ?? orderCtx.grandTotal),
      serviceType: orderCtx.serviceType,
      cancellationReasonId: null,
    },
    sql
  );
  const refund = refundFieldsFromEngineResult(engineResult.raw);

  await recordOrderCancellation(sql, {
    orderCorePk: row.coreId,
    cancelledBy: "customer",
    cancelledById: input.customerPk,
    reasonCode,
    reasonText: displayReason,
    displayReason,
    cancelledByType: "customer",
    cancelledByLabel: CUSTOMER_FOOD_CANCELLED_BY_LABEL,
    actionSource: "customer_app",
    cancelMode: "manual",
    attribute: "CUSTOMER",
    rejectionLabel: displayReason,
    previousStatus,
    acceptedAt: row.foodAcceptedAt?.toISOString?.() ?? null,
    grandTotal: row.grandTotal ?? 0,
    refundStatus: refund.refundStatus,
    refundAmount: refund.refundAmount,
    metadata: engineResult.raw ? { financial_rule_engine: engineResult.raw } : undefined,
    cancellationDetails: {
      version: 1,
      source: "customer",
      cancelled_by_label: CUSTOMER_FOOD_CANCELLED_BY_LABEL,
      rejected_reason: displayReason,
      reason_code: reasonCode,
      action_source: "customer_app",
      cancel_mode: "manual",
    },
  });

  try {
    await applyMerchantOrderCancellationLedger(
      {
        orderCoreId: row.coreId,
        source: "customer_cancel",
      },
      sql
    );
  } catch (ledgerErr) {
    console.warn("[cancelFoodOrderForCustomer] cancellation ledger failed:", ledgerErr);
  }

  if (!engineResult.applied) {
    try {
      await applyPaymentCancellationPayment({
        orderCoreId: row.coreId,
        ordersFoodId: row.ordersFoodId,
        merchantStoreId: orderCtx.merchantStoreId ?? row.merchantStoreId ?? 0,
        previousStatus,
        cancelledByType: "customer",
        orderGross: num(row.grandTotal ?? orderCtx.grandTotal),
        coreOrderId: orderCtx.coreOrderId,
        serviceType: orderCtx.serviceType,
      });
    } catch {
      /* non-fatal */
    }
  }

  return { orderId: orderIdText, status: "CANCELLED" };
}

export async function resolveCustomerPkFromSub(sub: string): Promise<number | null> {
  const db = getDb();
  const [row] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.customerId, sub))
    .limit(1);
  return row?.id ?? null;
}
