/**
 * GET /api/orders/[orderId]/refunds – list refunds for an order.
 * POST /api/orders/[orderId]/refunds – create a refund record.
 * POST requires ORDER_REFUND + ORDER_CANCEL access.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canRefundOrder } from "@/lib/permissions/actions";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { createOrderRefund, listOrderRefunds, type RefundTypeDb } from "@/lib/db/operations/order-refunds";
import { updateOrdersCoreCancellation, insertOrderCancellationReason } from "@/lib/db/operations/orders-core";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseOrderId(orderIdParam);
    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Invalid order id" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const canView =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));
    if (!canView) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions to view order refunds." },
        { status: 403 }
      );
    }

    const refunds = await listOrderRefunds(orderId);
    return NextResponse.json({ success: true, data: refunds });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/refunds] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list refunds",
      },
      { status: 500 }
    );
  }
}

function toRefundTypeDb(
  refundType: string
): RefundTypeDb {
  switch (refundType) {
    case "refund_with_cancellation":
      return "full";
    case "refund_without_cancellation":
      return "partial";
    default:
      return "partial";
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseOrderId(orderIdParam);
    if (!orderId) {
      return NextResponse.json(
        { success: false, error: "Invalid order id" },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    const canRefund = await canRefundOrder(
      user.id,
      user.email ?? "",
      "ORDER_FOOD"
    );
    if (!canRefund) {
      return NextResponse.json(
        {
          success: false,
          error: "Insufficient permissions. Refund and cancellation access required.",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const refundType = body?.refundType as string | undefined;
    const refundReason = body?.refundReason as string | undefined;
    const refundDescription = body?.refundDescription as string | undefined;
    const refundAmount = typeof body?.refundAmount === "number" ? body.refundAmount : Number(body?.refundAmount);
    const mxDebitAmount = typeof body?.mxDebitAmount === "number" ? body.mxDebitAmount : Number(body?.mxDebitAmount) || 0;
    const mxDebitReason = body?.mxDebitReason as string | undefined;
    const refundMetadata = (body?.refundMetadata ?? {}) as Record<string, unknown>;

    if (!refundType || !refundReason?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid: refundType or refundReason",
        },
        { status: 400 }
      );
    }

    // "cancel_without_refund" does not create a refund row; only update orders_core with cancellation (refundAmount not required)
    if (refundType === "cancel_without_refund") {
      const systemUser = await getSystemUserByEmail(user.email ?? "");
      const cancelledBy = systemUser?.primaryRole ?? "admin";
      const cancelledById = systemUser?.id ?? null;
      const reasonCode = (refundReason ?? "admin_cancel").trim().slice(0, 200) || "admin_cancel";
      const reasonText = (refundDescription ?? refundReason ?? "").trim().slice(0, 2000) || null;
      const cancellationReasonId =
        await insertOrderCancellationReason({
          orderId,
          cancelledBy,
          cancelledById,
          reasonCode,
          reasonText,
          refundStatus: "no_refund",
          metadata: { attribute: body?.attribute, rejection: body?.rejection, fault: body?.fault },
        }) ?? null;
      await updateOrdersCoreCancellation(orderId, {
        cancelledBy,
        cancelledById,
        cancellationReasonId,
        cancelledByType: "admin",
      });
      return NextResponse.json({
        success: true,
        data: { action: "cancel_without_refund", refundId: null },
        message: "Order cancel without refund recorded (no refund row created).",
      });
    }

    if (typeof refundAmount !== "number" || !Number.isFinite(refundAmount)) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid: refundAmount (required for refund types).",
        },
        { status: 400 }
      );
    }
    if (refundAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "refundAmount must be greater than 0" },
        { status: 400 }
      );
    }

    const systemUser = await getSystemUserByEmail(user.email ?? "");
    const refundInitiatedById = systemUser?.id ?? null;
    const refundInitiatedBy = systemUser?.primaryRole ?? "agent";

    const record = await createOrderRefund({
      orderId,
      orderPaymentId: null,
      refundType: toRefundTypeDb(refundType),
      refundReason: refundReason.trim(),
      refundDescription: refundDescription?.trim() ?? null,
      refundAmount,
      refundFee: 0,
      netRefundAmount: refundAmount,
      productType: "order",
      mxDebitAmount: mxDebitAmount > 0 ? mxDebitAmount : 0,
      mxDebitReason: mxDebitReason?.trim() ?? null,
      refundInitiatedBy,
      refundInitiatedById,
      refundMetadata: {
        ...refundMetadata,
        attribute: body?.attribute,
        rejection: body?.rejection,
        fault: body?.fault,
        merchantDebit: body?.merchantDebit,
        refundTypeUI: refundType,
      },
    });

    // When refund type is refund_with_cancellation, create cancellation reason and update orders_core
    if (refundType === "refund_with_cancellation") {
      const reasonCode = (refundReason ?? "refund_with_cancellation").trim().slice(0, 200) || "refund_with_cancellation";
      const reasonText = (refundDescription ?? refundReason ?? "").trim().slice(0, 2000) || null;
      const cancellationReasonId =
        await insertOrderCancellationReason({
          orderId,
          cancelledBy: refundInitiatedBy,
          cancelledById: refundInitiatedById,
          reasonCode,
          reasonText,
          refundStatus: "completed",
          refundAmount,
          metadata: {
            attribute: body?.attribute,
            rejection: body?.rejection,
            fault: body?.fault,
            merchantDebit: body?.merchantDebit,
          },
        }) ?? null;
      await updateOrdersCoreCancellation(orderId, {
        cancelledBy: refundInitiatedBy,
        cancelledById: refundInitiatedById,
        cancellationReasonId,
        cancelledByType: "admin",
      });
    }

    return NextResponse.json({
      success: true,
      data: record,
      message: "Refund created successfully.",
    });
  } catch (error) {
    console.error("[POST /api/orders/[orderId]/refunds] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to create refund",
      },
      { status: 500 }
    );
  }
}
