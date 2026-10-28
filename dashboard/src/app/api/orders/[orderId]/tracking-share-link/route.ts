/**
 * GET /api/orders/[orderId]/tracking-share-link
 * Returns (or creates) the public customer tracking URL for Rider details.
 * [orderId] may be formatted (GMF…) or numeric orders_core.id.
 */
import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getOrCreateOrderTrackingShare } from "@/lib/db/operations/order-tracking-share";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId } = await context.params;
    const raw = String(orderId ?? "").trim();
    if (!raw) return NextResponse.json({ error: "Invalid order id" }, { status: 400 });

    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) return authFailureResponse(auth);
    const { user } = auth;
    const allowed =
      (await isSuperAdmin(user.id, user.email ?? "")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_FOOD")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PARCEL")) ||
      (await hasDashboardAccessByAuth(user.id, user.email ?? "", "ORDER_PERSON_RIDE"));
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sql = getSql();
    let orderIdText = raw;
    let orderCoreId: number | null = /^\d+$/.test(raw) ? Number(raw) : null;

    if (orderCoreId != null) {
      const rows = await sql<{ formatted_order_id: string | null; order_id: string | null }[]>`
        SELECT formatted_order_id, order_id
        FROM orders_core
        WHERE id = ${orderCoreId}
        LIMIT 1
      `;
      orderIdText =
        rows[0]?.formatted_order_id?.trim() ||
        rows[0]?.order_id?.trim() ||
        raw;
    } else {
      const rows = await sql<{ id: number }[]>`
        SELECT id
        FROM orders_core
        WHERE formatted_order_id = ${raw} OR order_id = ${raw}
        ORDER BY id DESC
        LIMIT 1
      `;
      orderCoreId = rows[0]?.id != null ? Number(rows[0].id) : null;
    }

    const share = await getOrCreateOrderTrackingShare({
      orderIdText,
      orderCoreId,
    });
    if (!share) {
      return NextResponse.json(
        { success: false, error: "Could not resolve tracking share link" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      token: share.token,
      url: share.url,
      expiresAt: share.expiresAt,
      created: share.created,
      orderIdText,
    });
  } catch (e) {
    console.error("[GET /api/orders/[orderId]/tracking-share-link]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
