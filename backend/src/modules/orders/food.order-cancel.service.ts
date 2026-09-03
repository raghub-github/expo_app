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
import {
  resolveCustomerShownRefundAmount,
  resolveOrderPaidAmountForAutoRefund,
} from "../../lib/auto-refund-on-cancellation.js";
import { queueCustomerShownRefundAfterCancel } from "../../lib/trigger-order-auto-refund.js";
import { completeOrderDispatch } from "../../lib/order-dispatch.service.js";
import { clearMerchantStoreOrderNotifications } from "../../lib/clear-merchant-order-notifications.js";
import { emitEvent } from "../notifications/eventBus.js";

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

/** Restaurant has not accepted yet — customer cancel gets a full refund. */
function isPreMerchantAccept(
  foodStatus: string,
  acceptedAt: Date | string | null | undefined
): boolean {
  if (acceptedAt != null) return false;
  return (
    foodStatus === "CREATED" ||
    foodStatus === "NEW" ||
    foodStatus === "PLACED" ||
    foodStatus === "ORDER_PLACED" ||
    foodStatus === "ORDER_RECEIVED"
  );
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
  /** Amount shown on the cancel sheet as "Your refund" (UPI + GatiCash). */
  expectedRefundAmount?: number | null;
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
    try {
      const paid = await resolveOrderPaidAmountForAutoRefund(sql, row.coreId);
      const amount = resolveCustomerShownRefundAmount({
        promisedRefund: false,
        shownAmount: input.expectedRefundAmount,
        paidAmount: paid,
      });
      queueCustomerShownRefundAfterCancel({
        orderCoreId: row.coreId,
        reason: reasonText || "Cancelled by customer",
        amount,
        actorRole: "customer",
      });
    } catch {
      /* already cancelled — refund retry is best-effort */
    }
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
    const { getDb } = await import("../../db/client.js");
    const { releasePlatformOfferUsagesOnCancel } = await import(
      "../billing/platformOfferUsage.service.js"
    );
    await releasePlatformOfferUsagesOnCancel(getDb(), orderIdText);
  } catch {
    /* non-fatal — usage restore must not block cancel */
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

  let orderCtx: Awaited<ReturnType<typeof lookupOrderContext>> = {
    coreOrderId: orderIdText,
    grandTotal: num(row.grandTotal),
    serviceType: "FOOD",
    ordersFoodId: row.ordersFoodId ?? null,
    merchantStoreId: row.merchantStoreId ?? null,
  };
  let engineResult: Awaited<ReturnType<typeof executeOrderCancellationFinancials>> = {
    applied: false,
  };
  try {
    orderCtx = await lookupOrderContext(row.coreId, sql);
    engineResult = await executeOrderCancellationFinancials(
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
  } catch (financialErr) {
    console.warn(
      "[cancelFoodOrderForCustomer] financial engine failed (order stays cancelled):",
      financialErr
    );
  }
  const refund = refundFieldsFromEngineResult(engineResult.raw);
  const preAccept = isPreMerchantAccept(previousStatus, row.foodAcceptedAt);
  let refundStatus = refund.refundStatus;
  let refundAmount =
    refund.refundAmount != null && Number.isFinite(Number(refund.refundAmount))
      ? Number(refund.refundAmount)
      : null;

  let paidAmount = 0;
  try {
    paidAmount = await resolveOrderPaidAmountForAutoRefund(sql, row.coreId);
  } catch (paidErr) {
    console.warn("[cancelFoodOrderForCustomer] paid-amount lookup failed:", paidErr);
  }

  // Match the cancel sheet: if a refund amount is shown (pre-accept food/grocery),
  // move that money — GatiCash and/or UPI — even when the rule engine said no_refund.
  let refundableAmount = resolveCustomerShownRefundAmount({
    promisedRefund: preAccept,
    shownAmount: input.expectedRefundAmount,
    paidAmount,
  });
  if (refundableAmount > 0.005) {
    refundAmount = refundableAmount;
    if (refundStatus === "no_refund") refundStatus = "pending";
  }

  try {
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
    refundStatus: refundableAmount > 0.005 ? (refundStatus === "no_refund" ? "pending" : refundStatus) : refundStatus,
    refundAmount: refundableAmount > 0.005 ? refundableAmount : refundAmount,
    metadata: engineResult.raw ? { financial_rule_engine: engineResult.raw } : undefined,
    cancellationDetails: {
      version: 1,
      source: "customer",
      cancelled_by_label: CUSTOMER_FOOD_CANCELLED_BY_LABEL,
      rejected_reason: displayReason,
      reason_code: reasonCode,
      action_source: "customer_app",
      cancel_mode: "manual",
      pre_merchant_accept: preAccept,
    },
    });
  } catch (recordErr) {
    console.warn("[cancelFoodOrderForCustomer] cancellation record failed:", recordErr);
  }

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

  // Move money after the HTTP cancel succeeds. Awaiting Razorpay here made the
  // customer app hang / time out / crash on cancel even though the order was
  // already CANCELLED in the DB.
  if (refundableAmount > 0.005) {
    queueCustomerShownRefundAfterCancel({
      orderCoreId: row.coreId,
      reason: displayReason,
      amount: refundableAmount,
      actorRole: "customer",
    });
  }

  // Drop stale "New order!" inbox rows (customer cancel may happen while still CREATED).
  try {
    const storeId = orderCtx.merchantStoreId ?? row.merchantStoreId ?? 0;
    if (storeId > 0) {
      await clearMerchantStoreOrderNotifications(sql, {
        merchantStoreId: storeId,
        ordersFoodId: row.ordersFoodId,
        orderCoreId: row.coreId,
        formattedOrderId: row.formattedOrderId ?? orderIdText,
      });
    }
  } catch {
    /* non-fatal */
  }

  // Emit to notifications module — will fan out to customer + merchant + rider.
  // We do a quick lookup for the user_id form since orderCtx.customerPk is numeric.
  try {
    const sqlDb = getSql();
    const customerRows = (await sqlDb`
      SELECT customer_id FROM public.customers WHERE id = ${input.customerPk} LIMIT 1
    `) as unknown as Array<{ customer_id: string }>;
    emitEvent("order.status_changed", {
      orderId: orderIdText,
      orderShortId: row.formattedOrderId ?? orderIdText,
      fromStatus: previousStatus,
      toStatus: "CANCELLED",
      customerId: customerRows[0]?.customer_id ?? null,
      merchantStoreId: orderCtx.merchantStoreId ?? row.merchantStoreId ?? null,
      reason: reasonText || "Cancelled by customer",
      refundEligible: Number(refundableAmount) > 0.005,
      refundStatus,
      refundAmount: refundableAmount > 0.005 ? refundableAmount : refundAmount,
    });
  } catch { /* tolerated */ }

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
