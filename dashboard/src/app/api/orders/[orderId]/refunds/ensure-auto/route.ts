import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { listOrderRefunds } from "@/lib/db/operations/order-refunds";
import { isRefundSettled } from "@/lib/orders/refund-status";
import { triggerOrderAutoRefund } from "@/lib/triggerOrderAutoRefund";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function isMerchantOrSystemCancel(cancelledByType: string | null | undefined): boolean {
  const t = String(cancelledByType ?? "").trim().toLowerCase();
  if (!t || t === "customer" || t === "cx") return false;
  return t === "store" || t === "merchant" || t === "system" || t === "rider" || t === "admin";
}

/**
 * POST — repair missing customer refund ledger for merchant/system cancellations.
 * Idempotent: no-ops when a settled refund already exists.
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseOrderId(orderIdParam);
    if (!orderId) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) return authFailureResponse(auth);
    const { user } = auth;

    const canView =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PERSON_RIDE"));
    if (!canView) {
      return NextResponse.json(
        { success: false, error: "Insufficient permissions." },
        { status: 403 }
      );
    }

    const existing = await listOrderRefunds(orderId);
    if (existing.some(isRefundSettled)) {
      return NextResponse.json({
        success: true,
        repaired: false,
        data: existing,
      });
    }

    const sql = getSql();
    const cancelRows = await sql<
      Array<{
        cancelled_by_type: string | null;
        display_reason: string | null;
        rejected_reason: string | null;
      }>
    >`
      SELECT
        cancelled_by_type,
        display_reason,
        COALESCE(metadata->>'rejected_reason', reason_text) AS rejected_reason
      FROM order_cancellation_reasons
      WHERE order_id = ${orderId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    const cancel = cancelRows[0];
    if (!cancel || !isMerchantOrSystemCancel(cancel.cancelled_by_type)) {
      return NextResponse.json({
        success: true,
        repaired: false,
        data: existing,
        skipped: "not_merchant_system_cancel",
      });
    }

    const actorRole =
      String(cancel.cancelled_by_type ?? "store").trim().toLowerCase() === "merchant"
        ? "store"
        : String(cancel.cancelled_by_type ?? "store").trim().toLowerCase();
    const reason =
      String(cancel.display_reason ?? cancel.rejected_reason ?? "").trim() ||
      "Order cancelled by merchant";

    await triggerOrderAutoRefund({
      orderCorePk: orderId,
      reason,
      actorRole,
      actorEmail: user.email ?? null,
    });

    const refreshed = await listOrderRefunds(orderId);
    return NextResponse.json({
      success: true,
      repaired: true,
      data: refreshed,
    });
  } catch (error) {
    console.error("[POST /api/orders/[orderId]/refunds/ensure-auto] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to ensure auto-refund",
      },
      { status: 500 }
    );
  }
}
