/**
 * POST /api/merchant-menu/change-requests/[id]/reject
 * Reject a change request (agent/superadmin). Body: { reviewed_reason?: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
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

    let reviewedReason: string | null = null;
    try {
      const body = await request.json();
      if (body && typeof body.reviewed_reason === "string") {
        reviewedReason = body.reviewed_reason.slice(0, 1000);
      }
    } catch {
      // no body or invalid JSON
    }

    const sql = getSql();
    const result = await sql`
      UPDATE merchant_menu_item_change_requests
      SET status = 'REJECTED'::merchant_menu_item_change_request_status,
          reviewed_by = ${user.email}, reviewed_by_role = 'agent',
          reviewed_reason = ${reviewedReason}, updated_at = NOW()
      WHERE id = ${reqId} AND status = 'PENDING'::merchant_menu_item_change_request_status
    `;
    if ((result.count ?? 0) === 0) {
      return NextResponse.json({ success: false, error: "Request not found or not pending" }, { status: 404 });
    }
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[POST /api/merchant-menu/change-requests/[id]/reject]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
