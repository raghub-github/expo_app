import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { clearRiderPaymentHoldOnBackend } from "@/lib/orders/rider-management-backend";
import { stampOrderRoutedTo } from "@/lib/orders/stamp-order-routed-to";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) ? id : null;
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderCoreId = parseOrderId(orderIdParam);
    if (!orderCoreId) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PERSON_RIDE"));

    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions. Access to Orders dashboard required." },
        { status: 403 }
      );
    }

    const result = await clearRiderPaymentHoldOnBackend({
      ordersCoreId: orderCoreId,
      actorEmail: user.email ?? null,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.status });
    }

    const systemUser = await getSystemUserByEmail(user.email ?? "");
    const actorName = systemUser?.fullName?.trim() || user.email || null;
    const actorRole = systemUser?.primaryRole ?? "AGENT";

    await stampOrderRoutedTo({
      orderId: orderCoreId,
      systemUserId: systemUser?.id ?? null,
      actorEmail: user.email ?? null,
      actorName,
      actorRole,
      action: "clear_rider_hold",
      actionLabel: "Cleared rider payment hold",
    });

    return NextResponse.json({
      success: true,
      credited: result.credited ?? false,
      routedToEmail: user.email ?? null,
      routedToName: actorName,
    });
  } catch (error) {
    console.error("[POST /api/orders/[orderId]/clear-rider-payment-hold] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to clear rider payment hold",
      },
      { status: 500 }
    );
  }
}
