/**
 * GET /api/merchant-menu/change-requests
 * List change requests (agent/superadmin). Query: storeId, status, request_type, limit, offset.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const superAdmin = await isSuperAdmin(user.id, user.email);
    const hasMerchant = await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT");
    if (!superAdmin && !hasMerchant) {
      return NextResponse.json({ success: false, error: "Agent or admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get("storeId");
    const status = searchParams.get("status");
    const request_type = searchParams.get("request_type");
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
    const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

    const sql = getSql();
    let storeIdNum: number | null = null;
    if (storeId) {
      const rows = await sql`SELECT id FROM merchant_stores WHERE store_id = ${storeId} LIMIT 1`;
      if (rows[0]) storeIdNum = Number((rows[0] as { id: number }).id);
    }

    const storeCond = storeIdNum != null ? sql`AND r.store_id = ${storeIdNum}` : sql``;
    const statusCond =
      status === "PENDING" || status === "APPROVED" || status === "REJECTED" || status === "CANCELLED"
        ? sql`AND r.status = ${status}::merchant_menu_item_change_request_status`
        : sql``;
    const typeCond =
      request_type === "CREATE" || request_type === "UPDATE" || request_type === "DELETE"
        ? sql`AND r.request_type = ${request_type}::merchant_menu_item_change_request_type`
        : sql``;

    const countResult = await sql`
      SELECT COUNT(*)::int AS c FROM merchant_menu_item_change_requests r WHERE 1=1 ${storeCond} ${statusCond} ${typeCond}
    `;
    const total = Number((countResult[0] as { c: number })?.c ?? 0);

    const rows = await sql`
      SELECT r.id, r.store_id, r.menu_item_id, r.request_type::text, r.status::text,
             r.requested_payload, r.current_snapshot, r.reason, r.created_by, r.created_by_role,
             r.reviewed_by, r.reviewed_reason, r.created_at, r.updated_at,
             i.item_name, i.item_id AS menu_item_public_id
      FROM merchant_menu_item_change_requests r
      LEFT JOIN merchant_menu_items i ON i.id = r.menu_item_id AND i.store_id = r.store_id
      WHERE 1=1 ${storeCond} ${statusCond} ${typeCond}
      ORDER BY r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    return NextResponse.json({
      success: true,
      change_requests: rows,
      total,
    });
  } catch (e) {
    console.error("[GET /api/merchant-menu/change-requests]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
