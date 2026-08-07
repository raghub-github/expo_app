import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
/**
 * GET /api/orders/[orderId]/rider-tracking
 * Live rider location + recent trail for order detail map (orders_core.id).
 */

import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getOrderRiderTracking } from "@/lib/db/operations/order-rider-tracking";

export const runtime = "nodejs";

function parseId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) ? id : null;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderCoreId = parseId(orderIdParam);
    if (!orderCoreId) {
      return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
    }

    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = await getOrderRiderTracking(orderCoreId);
    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/rider-tracking] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
