import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { NextRequest, NextResponse } from "next/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Lightweight fingerprint for order-detail auto-refresh (status / rider / food pipeline).
 */
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

    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) return authFailureResponse(auth);
    const { user } = auth;

    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PARCEL")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PERSON_RIDE"));

    if (!allowed) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const sql = getSql();
    const rows = await sql<
      {
        status: string | null;
        current_status: string | null;
        rider_id: number | null;
        updated_at: Date | string | null;
        food_status: string | null;
      }[]
    >`
      SELECT
        oc.status::text AS status,
        oc.current_status::text AS current_status,
        oc.rider_id,
        oc.updated_at,
        f.order_status::text AS food_status
      FROM orders_core oc
      LEFT JOIN LATERAL (
        SELECT order_status
        FROM orders_food
        WHERE order_id = oc.id
        ORDER BY id DESC
        LIMIT 1
      ) f ON TRUE
      WHERE oc.id = ${orderCoreId}
      LIMIT 1
    `;

    const row = rows[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    const status = String(row.status ?? "");
    const currentStatus = String(row.current_status ?? "");
    const foodStatus = String(row.food_status ?? "");
    const riderId =
      row.rider_id != null && Number.isFinite(Number(row.rider_id)) ? Number(row.rider_id) : null;
    const fingerprint = [status, currentStatus, foodStatus, riderId ?? ""].join("|");

    return NextResponse.json({
      success: true,
      status,
      currentStatus,
      foodStatus,
      riderId,
      updatedAt:
        row.updated_at instanceof Date
          ? row.updated_at.toISOString()
          : row.updated_at
            ? String(row.updated_at)
            : null,
      fingerprint,
    });
  } catch (error) {
    console.error("[GET /api/orders/[orderId]/live-snapshot]", error);
    return NextResponse.json({ success: false, error: "Failed to load live snapshot" }, { status: 500 });
  }
}
