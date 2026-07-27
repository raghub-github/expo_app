/**
 * GET /api/merchant-menu/change-requests/[id]
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { toLegacyRequestType } from "@/lib/merchant-menu-review";

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
             r.add_payload, r.submitted_by, r.submitted_by_role, r.submitted_at,
             r.reviewed_by, r.reviewed_by_role, r.reviewed_at, r.rejection_reason,
             r.source::text, r.created_at, r.updated_at,
             i.item_name, i.item_id AS menu_item_public_id,
             COALESCE(
               (SELECT jsonb_agg(jsonb_build_object(
                 'id', c.id,
                 'field_name', c.field_name,
                 'old_value', c.old_value,
                 'new_value', c.new_value,
                 'created_at', c.created_at
               ) ORDER BY c.id)
                FROM merchant_menu_item_review_changes c
                WHERE c.review_request_id = r.id),
               '[]'::jsonb
             ) AS changes
      FROM merchant_menu_item_review_requests r
      LEFT JOIN merchant_menu_items i ON i.id = r.menu_item_id AND i.store_id = r.store_id
      WHERE r.id = ${reqId}
    `;
    if (!row) {
      return NextResponse.json({ success: false, error: "Request not found" }, { status: 404 });
    }
    const r = row as any;
    return NextResponse.json({
      success: true,
      change_request: {
        ...r,
        request_type: toLegacyRequestType(String(r.request_type)),
        created_by: r.submitted_by,
        created_by_role: r.submitted_by_role,
        created_at: r.submitted_at ?? r.created_at,
        reviewed_reason: r.rejection_reason,
        requested_payload: r.add_payload ?? {},
        current_snapshot: null,
        changes: r.changes ?? [],
      },
    });
  } catch (e) {
    console.error("[GET /api/merchant-menu/change-requests/[id]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
