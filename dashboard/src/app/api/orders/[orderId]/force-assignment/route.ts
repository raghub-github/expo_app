import { NextRequest, NextResponse } from "next/server";
import { requireOrderApiAuth, orderAuthFailureResponse } from "@/lib/auth/require-order-api-auth";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import {
  cancelForceAssignmentOnBackend,
  getForceAssignmentOnBackend,
  startForceAssignmentOnBackend,
} from "@/lib/orders/rider-management-backend";
import { stampOrderRoutedTo } from "@/lib/orders/stamp-order-routed-to";
import { getSql } from "@/lib/db/client";
import {
  isSelfPickupFulfillmentOrder,
  TAKEAWAY_RIDER_ASSIGN_BLOCKED_MESSAGE,
} from "@/lib/orders/order-detail-display";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function requireOrderFoodAccess(request?: Pick<NextRequest, "signal">) {
  const auth = await requireOrderApiAuth(request, { access: ["ORDER_FOOD"] });
  if (!auth.ok) {
    return { error: orderAuthFailureResponse(auth) };
  }
  return { user: auth.user };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderCoreId = parseOrderId(orderIdParam);
    if (!orderCoreId) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const auth = await requireOrderFoodAccess(_request);
    if ("error" in auth && auth.error) return auth.error;

    const result = await getForceAssignmentOnBackend({ ordersCoreId: orderCoreId });
    if (!result.ok) {
      // Backend down / unreachable — treat as no active force assignment (non-blocking).
      if (result.status === 502 || result.status === 503) {
        return NextResponse.json({ success: true, forceAssignment: null });
      }
      return NextResponse.json(
        { success: false, error: result.error },
        { status: result.status }
      );
    }

    return NextResponse.json({ success: true, forceAssignment: result.forceAssignment });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/force-assignment]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

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

    const auth = await requireOrderFoodAccess(request);
    if ("error" in auth && auth.error) return auth.error;
    const user = auth.user!;

    const body = (await request.json().catch(() => ({}))) as {
      newRiderId?: number;
      reasonCode?: string;
      reasonText?: string;
      catalogReasonId?: number | null;
      radiusKm?: number | null;
    };

    const newRiderId = Number(body.newRiderId);
    const reasonCode = String(body.reasonCode ?? "").trim();
    const reasonText = String(body.reasonText ?? "").trim();
    const radiusKmRaw = body.radiusKm != null ? Number(body.radiusKm) : null;
    const radiusKm =
      radiusKmRaw != null && Number.isFinite(radiusKmRaw)
        ? Math.min(10, Math.max(0.5, radiusKmRaw))
        : 10;

    if (!Number.isFinite(newRiderId) || newRiderId < 1) {
      return NextResponse.json({ success: false, error: "Select a rider" }, { status: 400 });
    }
    if (!reasonCode || !reasonText) {
      return NextResponse.json(
        { success: false, error: "Select a cancellation reason before Force Assignment" },
        { status: 400 }
      );
    }

    const sql = getSql();
    const orderRows = await sql`
      SELECT
        delivery_type AS "deliveryType",
        billing_snapshot AS "billingSnapshot",
        checkout_metadata AS "checkoutMetadata"
      FROM orders_core
      WHERE id = ${orderCoreId}
      LIMIT 1
    `;
    const orderRow = (orderRows as unknown as Array<{
      deliveryType: string | null;
      billingSnapshot: unknown;
      checkoutMetadata: unknown;
    }>)[0];
    if (!orderRow) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }
    if (
      isSelfPickupFulfillmentOrder(
        orderRow.deliveryType,
        orderRow.billingSnapshot,
        orderRow.checkoutMetadata
      )
    ) {
      return NextResponse.json(
        {
          success: false,
          error: TAKEAWAY_RIDER_ASSIGN_BLOCKED_MESSAGE,
          code: "TAKEAWAY_NO_RIDER",
        },
        { status: 409 }
      );
    }

    const systemUser = user.email ? await getSystemUserByEmail(user.email) : null;

    const result = await startForceAssignmentOnBackend({
      ordersCoreId: orderCoreId,
      newRiderId,
      reasonCode,
      reasonText,
      catalogReasonId: body.catalogReasonId ?? null,
      actorEmail: user.email ?? null,
      actorId: systemUser?.id != null ? String(systemUser.id) : user.id,
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
      actorEmail: user.email ?? null,
      actorName: systemUser?.full_name ?? null,
      actorRole: systemUser?.primary_role ?? null,
      action: "rider_force_assign",
      actionLabel: "Force Assignment",
      metadata: {
        action: "force_assignment",
        newRiderId,
        reasonCode,
        reasonText,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      success: true,
      forceAssignment: result.forceAssignment,
      routedToEmail: user.email ?? null,
    });
  } catch (error) {
    console.error("[POST /api/orders/[orderId]/force-assignment]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderCoreId = parseOrderId(orderIdParam);
    if (!orderCoreId) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const auth = await requireOrderFoodAccess(_request);
    if ("error" in auth && auth.error) return auth.error;
    const user = auth.user!;

    const systemUser = user.email ? await getSystemUserByEmail(user.email) : null;

    const result = await cancelForceAssignmentOnBackend({
      ordersCoreId: orderCoreId,
      actorEmail: user.email ?? null,
      actorId: systemUser?.id != null ? String(systemUser.id) : user.id,
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
      actorEmail: user.email ?? null,
      actorName: systemUser?.full_name ?? null,
      actorRole: systemUser?.primary_role ?? null,
      action: "rider_force_assign",
      actionLabel: "Force Assignment cancelled",
      metadata: { action: "force_assignment_cancel" },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, routedToEmail: user.email ?? null });
  } catch (error) {
    console.error("[DELETE /api/orders/[orderId]/force-assignment]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
