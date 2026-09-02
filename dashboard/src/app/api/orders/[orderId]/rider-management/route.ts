import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getSql } from "@/lib/db/client";
import {
  cancelAndReassignRiderOnBackend,
  cancelRiderOnlyOnBackend,
  hardAssignRiderOnBackend,
  manualAssignRiderOnBackend,
} from "@/lib/orders/rider-management-backend";
import { applyRiderCancellationPenalty } from "@/lib/orders/apply-rider-cancellation-penalty";
import { stampOrderRoutedTo } from "@/lib/orders/stamp-order-routed-to";
import {
  isSelfPickupFulfillmentOrder,
  TAKEAWAY_RIDER_ASSIGN_BLOCKED_MESSAGE,
} from "@/lib/orders/order-detail-display";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) ? id : null;
}

type RiderManagementAction =
  | "cancel_only"
  | "cancel_reassign"
  | "assign_rider"
  | "hard_assign";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderCoreId = parseOrderId(orderIdParam);
    if (!orderCoreId) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. Access to Orders dashboard required." },
        { status: 403 }
      );
    }

    let body: Record<string, unknown> = {};
    try {
      const raw = await request.text();
      if (raw.trim()) {
        body = JSON.parse(raw) as Record<string, unknown>;
      }
    } catch {
      return NextResponse.json({ success: false, error: "Invalid request body" }, { status: 400 });
    }

    const action = String(body.action ?? "").trim() as RiderManagementAction;
    const riderId =
      body.riderId != null && Number.isFinite(Number(body.riderId)) ? Number(body.riderId) : null;
    const reasonCode =
      typeof body.reasonCode === "string" && body.reasonCode.trim()
        ? body.reasonCode.trim()
        : typeof body.catalogReasonCode === "string" && body.catalogReasonCode.trim()
          ? body.catalogReasonCode.trim()
          : null;
    const reasonText =
      typeof body.reasonText === "string" && body.reasonText.trim()
        ? body.reasonText.trim()
        : typeof body.rejectionOption === "string" && body.rejectionOption.trim()
          ? body.rejectionOption.trim()
          : null;
    const catalogReasonId =
      body.catalogReasonId != null && Number.isFinite(Number(body.catalogReasonId))
        ? Number(body.catalogReasonId)
        : null;
    const radiusKmRaw =
      body.radiusKm != null && Number.isFinite(Number(body.radiusKm))
        ? Number(body.radiusKm)
        : null;
    const radiusKm =
      radiusKmRaw != null ? Math.min(10, Math.max(0.5, radiusKmRaw)) : 10;

    if (!["cancel_only", "cancel_reassign", "assign_rider", "hard_assign"].includes(action)) {
      return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }

    const sql = getSql();
    const orderRows = await sql`
      SELECT
        id,
        rider_id AS "riderId",
        order_type AS "orderType",
        delivery_type AS "deliveryType",
        billing_snapshot AS "billingSnapshot",
        checkout_metadata AS "checkoutMetadata"
      FROM orders_core
      WHERE id = ${orderCoreId}
      LIMIT 1
    `;
    const orderRow = (orderRows as unknown as Array<{
      id: number;
      riderId: number | null;
      orderType: string | null;
      deliveryType: string | null;
      billingSnapshot: unknown;
      checkoutMetadata: unknown;
    }>)[0];

    if (!orderRow) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    if (orderRow.orderType !== "food") {
      return NextResponse.json(
        { success: false, error: "Rider management is only supported for food orders" },
        { status: 400 }
      );
    }

    const takeawayNoRider =
      isSelfPickupFulfillmentOrder(
        orderRow.deliveryType,
        orderRow.billingSnapshot,
        orderRow.checkoutMetadata
      ) &&
      (action === "assign_rider" || action === "hard_assign" || action === "cancel_reassign");

    if (takeawayNoRider) {
      return NextResponse.json(
        {
          success: false,
          error: TAKEAWAY_RIDER_ASSIGN_BLOCKED_MESSAGE,
          code: "TAKEAWAY_NO_RIDER",
        },
        { status: 409 }
      );
    }

    const systemUser = await getSystemUserByEmail(user.email ?? "");
    const actorEmail = user.email ?? null;
    const actorId = systemUser?.id != null ? String(systemUser.id) : actorEmail;

    if (action === "hard_assign") {
      if (orderRow.riderId != null) {
        return NextResponse.json(
          { success: false, error: "Order already has an assigned rider — use Force Assignment" },
          { status: 409 }
        );
      }
      if (riderId == null) {
        return NextResponse.json({ success: false, error: "Select a rider" }, { status: 400 });
      }
      const result = await hardAssignRiderOnBackend({
        ordersCoreId: orderCoreId,
        riderId,
        actorEmail,
        actorId,
        radiusKm,
      });
      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: result.status }
        );
      }
      await stampOrderRoutedTo({
        orderId: orderCoreId,
        systemUserId: systemUser?.id ?? null,
        actorEmail,
        actorName: systemUser?.full_name ?? null,
        actorRole: systemUser?.primary_role ?? null,
        action: "rider_manual_assign",
        actionLabel: "Assign rider manually (specific rider)",
        metadata: { action: "hard_assign", riderId },
      }).catch(() => undefined);
      return NextResponse.json({ success: true, routedToEmail: actorEmail });
    }

    if (action === "assign_rider") {
      if (orderRow.riderId != null) {
        return NextResponse.json(
          { success: false, error: "Order already has an assigned rider" },
          { status: 409 }
        );
      }
      const result = await manualAssignRiderOnBackend({
        ordersCoreId: orderCoreId,
        actorEmail,
      });
      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: result.status });
      }
      const stamp = await stampOrderRoutedTo({
        orderId: orderCoreId,
        systemUserId: systemUser?.id ?? null,
        actorEmail,
        actorName: systemUser?.full_name ?? null,
        actorRole: systemUser?.primary_role ?? null,
        action: "rider_manual_assign",
        actionLabel: "Assign rider manually",
        metadata: { action: "assign_rider" },
      }).catch(() => ({ ok: false as const, routedToEmail: null }));
      return NextResponse.json({
        success: true,
        action,
        routedToEmail: stamp.routedToEmail ?? actorEmail,
      });
    }

    const effectiveRiderId = riderId ?? orderRow.riderId;
    if (effectiveRiderId == null) {
      return NextResponse.json(
        { success: false, error: "No rider assigned to cancel" },
        { status: 400 }
      );
    }

    if (!reasonCode && !reasonText) {
      return NextResponse.json(
        { success: false, error: "Cancellation reason is required" },
        { status: 400 }
      );
    }

    const payload = {
      ordersCoreId: orderCoreId,
      riderId: effectiveRiderId,
      reasonCode: reasonCode ?? "AGENT_CANCEL",
      reasonText: reasonText ?? reasonCode ?? "Agent cancelled rider",
      actorEmail,
      actorId,
    };

    let penaltyResult: Awaited<ReturnType<typeof applyRiderCancellationPenalty>> | null = null;
    const faultRaw =
      typeof body.fault === "string" ? body.fault.trim().toLowerCase() : "";
    const isThreePlFault = faultRaw === "3pl_fault" || faultRaw === "3pl";

    if (isThreePlFault) {
      penaltyResult = await applyRiderCancellationPenalty({
        orderCoreId: orderCoreId,
        riderId: effectiveRiderId,
        catalogReasonId: catalogReasonId ?? 0,
        fault: "3pl_fault",
        actorSystemUserId: systemUser?.id ?? null,
        source: "rider_management",
      });
    }

    const result =
      action === "cancel_reassign"
        ? await cancelAndReassignRiderOnBackend(payload)
        : await cancelRiderOnlyOnBackend(payload);

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    await stampOrderRoutedTo({
      orderId: orderCoreId,
      systemUserId: systemUser?.id ?? null,
      actorEmail,
      actorName: systemUser?.full_name ?? null,
      actorRole: systemUser?.primary_role ?? null,
      action: "rider_cancel",
      actionLabel:
        action === "cancel_reassign"
          ? "Rider cancellation + reassign"
          : "Rider cancellation",
      metadata: { action, reasonCode, reasonText },
    });

    return NextResponse.json({
      success: true,
      action,
      waitingForManualAssignment: action === "cancel_only",
      riderPenalty: penaltyResult,
    });
  } catch (error) {
    console.error("[POST /api/orders/[orderId]/rider-management] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
