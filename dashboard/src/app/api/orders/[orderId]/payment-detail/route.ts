import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
/**
 * GET /api/orders/[orderId]/payment-detail
 * Payment card + modal payload for order detail (non-blocking vs core list).
 */

import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { fetchOrderPaymentDetailByCoreId } from "@/lib/orders/order-payment-detail";

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
    if (orderId == null) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const [userIsSuperAdmin, hasOrderAccess] = await Promise.all([
      isSuperAdmin(user.id, user.email ?? ""),
      hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"),
    ]);

    if (!userIsSuperAdmin && !hasOrderAccess) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions." },
        { status: 403 }
      );
    }

    const paymentDetail = await fetchOrderPaymentDetailByCoreId(orderId);
    if (!paymentDetail) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: paymentDetail });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/payment-detail]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
