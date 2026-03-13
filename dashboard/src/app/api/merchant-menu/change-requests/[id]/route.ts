/**
 * GET /api/merchant-menu/change-requests/[id]
 * Get a single change request (agent/superadmin).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;
    const reqId = parseInt(id, 10);
    if (!Number.isFinite(reqId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const sql = getSql();
    const [row] = await sql`
      SELECT r.id, r.store_id, r.menu_item_id, r.request_type::text, r.status::text,
             r.requested_payload, r.current_snapshot, r.reason, r.created_by, r.created_by_role,
             r.reviewed_by, r.reviewed_by_role, r.reviewed_reason, r.created_at, r.updated_at,
             i.item_name, i.item_id AS menu_item_public_id
      FROM merchant_menu_item_change_requests r
      LEFT JOIN merchant_menu_items i ON i.id = r.menu_item_id AND i.store_id = r.store_id
      WHERE r.id = ${reqId}
    `;
    if (!row) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, change_request: row });
  } catch (e) {
    console.error("[GET /api/merchant-menu/change-requests/[id]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
