import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
/**
 * GET /api/orders/[orderId]/recovery-records
 * Lists penalty / debit / credit records tied to an order
 * (rider cancellation penalties + merchant cancellation ledger).
 */

import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { listOrderRecoveryRecords } from "@/lib/db/operations/order-recovery-records";

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

    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const canView =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD"));
    if (!canView) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions to view recovery records." },
        { status: 403 }
      );
    }

    const records = await listOrderRecoveryRecords(orderId);
    return NextResponse.json({ success: true, data: records });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/recovery-records] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to list recovery records",
      },
      { status: 500 }
    );
  }
}
