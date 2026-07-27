/**
 * POST /api/merchant-menu/change-requests/[id]/reject
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { rejectMenuReviewRequest } from "@/lib/merchant-menu-review";

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
      // no body
    }

    const result = await rejectMenuReviewRequest(reqId, user.email, reviewedReason);
    if (!result.ok) {
      const status = result.error === "request_not_found" ? 404 : 400;
      return NextResponse.json({ success: false, error: result.error ?? "reject_failed" }, { status });
    }

    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[POST /api/merchant-menu/change-requests/[id]/reject]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
