import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
/**
 * GET /api/orders/[orderId]/partner-chat
 * Read-only customer ↔ rider chat for dashboard order detail.
 */

import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { listOrderPartnerChatForDashboard } from "@/lib/db/operations/order-partner-chat";

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

    const email = user.email ?? "";
    const allowed =
      (await isSuperAdmin(user.id, email)) ||
      (await hasDashboardAccessByAuth(user.id, email, "ORDER_FOOD")) ||
      (await hasDashboardAccessByAuth(user.id, email, "ORDER_PARCEL")) ||
      (await hasDashboardAccessByAuth(user.id, email, "ORDER_PERSON_RIDE"));

    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload = await listOrderPartnerChatForDashboard(orderCoreId);
    return NextResponse.json(payload);
  } catch (error) {
    const statusCode =
      error && typeof error === "object" && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 500;
    console.error("[GET /api/orders/[orderId]/partner-chat] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: statusCode >= 400 && statusCode < 600 ? statusCode : 500 }
    );
  }
}
