/**
 * POST /api/merchant-menu/change-requests/[id]/approve
 */
import { NextRequest, NextResponse } from "next/server";
import { authFailureResponse, getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { approveMenuReviewRequest } from "@/lib/merchant-menu-review";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) return authFailureResponse(auth);
    const { user } = auth;
    const userEmail = user.email ?? "";
    if (!userEmail) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const superAdmin = await isSuperAdmin(user.id, userEmail);
    const hasMerchant = await hasDashboardAccessByAuth(user.id, userEmail, "MERCHANT");
    if (!superAdmin && !hasMerchant) {
      return NextResponse.json({ success: false, error: "Agent or admin access required" }, { status: 403 });
    }

    const { id } = await params;
    const reqId = parseInt(id, 10);
    if (!Number.isFinite(reqId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const result = await approveMenuReviewRequest(reqId, userEmail);
    if (!result.ok) {
      const status = result.error === "request_not_found" ? 404 : 400;
      return NextResponse.json({ success: false, error: result.error ?? "approve_failed" }, { status });
    }

    return NextResponse.json({
      success: true,
      ok: true,
      menu_item_id: result.menu_item_id ?? null,
    });
  } catch (e) {
    console.error("[POST /api/merchant-menu/change-requests/[id]/approve]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
