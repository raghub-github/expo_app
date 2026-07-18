/**
 * GET /api/orders/[orderId]/payment-detail
 * Payment card + modal payload for order detail (non-blocking vs core list).
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { fetchOrderPaymentDetail } from "@/lib/orders/order-payment-detail";

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

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

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

    const sql = getSql();
    const rows = await sql`
      SELECT
        id,
        order_id,
        formatted_order_id,
        merchant_store_id,
        order_type,
        order_source,
        payment_status,
        payment_method,
        grand_total,
        item_total,
        addon_total,
        tip_amount
      FROM orders_core
      WHERE id = ${orderId}
      LIMIT 1
    `;
    const row = (rows as Record<string, unknown>[])[0];
    if (!row) {
      return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
    }

    const paymentDetail = await fetchOrderPaymentDetail({
      orderCoreId: orderId,
      orderIdText: row.order_id != null ? String(row.order_id) : null,
      formattedOrderId:
        row.formatted_order_id != null ? String(row.formatted_order_id) : null,
      displayId:
        (typeof row.formatted_order_id === "string" && row.formatted_order_id.trim()) ||
        (row.order_id ? String(row.order_id) : `ORDER-${orderId}`),
      merchantStoreId:
        row.merchant_store_id != null && Number.isFinite(Number(row.merchant_store_id))
          ? Number(row.merchant_store_id)
          : null,
      orderType: row.order_type != null ? String(row.order_type) : "food",
      orderSource: row.order_source != null ? String(row.order_source) : null,
      paymentStatus: row.payment_status != null ? String(row.payment_status) : null,
      paymentMethod: row.payment_method != null ? String(row.payment_method) : null,
      grandTotal: row.grand_total != null ? Number(row.grand_total) : null,
      itemTotal: row.item_total != null ? Number(row.item_total) : null,
      addonTotal: row.addon_total != null ? Number(row.addon_total) : null,
      tipAmount: row.tip_amount != null ? Number(row.tip_amount) : null,
    });

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
