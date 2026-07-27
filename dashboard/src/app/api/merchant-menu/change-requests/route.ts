/**
 * GET /api/merchant-menu/change-requests
 * List field-level menu review requests (agent/superadmin).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";
import { mapLegacyRequestType, toLegacyRequestType } from "@/lib/merchant-menu-review";

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
      if (storeIdNum == null && /^\d+$/.test(storeId)) {
        const byId = await sql`SELECT id FROM merchant_stores WHERE id = ${parseInt(storeId, 10)} LIMIT 1`;
        if (byId[0]) storeIdNum = Number((byId[0] as { id: number }).id);
      }
    }

    const mappedType = mapLegacyRequestType(request_type);
    const storeCond = storeIdNum != null ? sql`AND r.store_id = ${storeIdNum}` : sql``;
    const statusCond =
      status === "PENDING" || status === "APPROVED" || status === "REJECTED"
        ? sql`AND r.status = ${status}::merchant_menu_item_review_request_status`
        : sql``;
    const typeCond =
      mappedType != null
        ? sql`AND r.request_type = ${mappedType}::merchant_menu_item_review_request_type`
        : sql``;

    const countResult = await sql`
      SELECT COUNT(*)::int AS c FROM merchant_menu_item_review_requests r
      WHERE 1=1 ${storeCond} ${statusCond} ${typeCond}
    `;
    const total = Number((countResult[0] as { c: number })?.c ?? 0);

    const rows = await sql`
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
      WHERE 1=1 ${storeCond} ${statusCond} ${typeCond}
      ORDER BY r.submitted_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const change_requests = (rows as any[]).map((r) => ({
      ...r,
      request_type: toLegacyRequestType(String(r.request_type)),
      created_by: r.submitted_by,
      created_by_role: r.submitted_by_role,
      created_at: r.submitted_at ?? r.created_at,
      reviewed_reason: r.rejection_reason,
      requested_payload: r.add_payload ?? {},
      current_snapshot: null,
      changes: r.changes ?? [],
    }));

    return NextResponse.json({
      success: true,
      change_requests,
      review_requests: rows,
      total,
    });
  } catch (e) {
    console.error("[GET /api/merchant-menu/change-requests]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
