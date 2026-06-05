/**
 * POST /api/orders/[orderId]/refunds/preview — simulate Financial Rule Engine outcome.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canRefundOrder } from "@/lib/permissions/actions";
import { executeFinancialRule, lookupOrderContext } from "@/lib/financial-rule-executor";
import { mapActorToTriggeredBy, resolvePaymentCancellationMilestone } from "@gatimitra/financial-rules";
import { resolveCancellationCatalogForOrder } from "@/lib/db/operations/order-cancellation-reason-catalog";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseOrderId(orderIdParam);
    if (!orderId) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const canRefund = await canRefundOrder(user.id, user.email ?? "", "ORDER_FOOD");
    if (!canRefund) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const refundType = String(body?.refundType ?? "refund_without_cancellation");
    const refundAmount = typeof body?.refundAmount === "number" ? body.refundAmount : Number(body?.refundAmount);
    const catalogReasonId =
      typeof body?.catalogReasonId === "number" ? body.catalogReasonId : Number(body?.catalogReasonId);

    const catalogRow = await resolveCancellationCatalogForOrder({
      catalogReasonId: Number.isFinite(catalogReasonId) ? catalogReasonId : null,
      attribute: typeof body?.attribute === "string" ? body.attribute : null,
      rejection: typeof body?.rejection === "string" ? body.rejection : null,
    });
    if (!catalogRow) {
      return NextResponse.json({ success: false, error: "Invalid cancellation reason" }, { status: 400 });
    }

    const orderCtx = await lookupOrderContext(orderId);
    const { orderMilestone } = resolvePaymentCancellationMilestone({
      previousStatus: orderCtx.orderStatus,
      cancelledByType: "admin",
      wasDelivered: refundType === "refund_with_cancellation",
    });

    const scenario =
      refundType === "cancel_without_refund"
        ? "CANCELLATION"
        : refundType === "refund_with_cancellation"
          ? "POST_DELIVERY_CANCELLATION"
          : "PARTIAL_REFUND";

    const gross =
      refundType === "refund_without_cancellation" && Number.isFinite(refundAmount) && refundAmount > 0
        ? refundAmount
        : orderCtx.grandTotal;

    const result = await executeFinancialRule({
      scenarioType: scenario,
      orderCoreId: orderId,
      ordersFoodId: orderCtx.ordersFoodId,
      coreOrderId: orderCtx.coreOrderId,
      serviceType: orderCtx.serviceType,
      orderStage: orderMilestone,
      triggeredBy: mapActorToTriggeredBy("admin"),
      cancellationReasonId: catalogRow.id,
      orderGross: gross,
      simulateOnly: true,
      metadata: body?.refundMetadata as Record<string, unknown> | undefined,
    });

    return NextResponse.json({
      success: true,
      preview: result.raw ?? result,
      scenario,
      orderMilestone,
    });
  } catch (error) {
    console.error("[POST refunds/preview]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Preview failed" },
      { status: 500 }
    );
  }
}
