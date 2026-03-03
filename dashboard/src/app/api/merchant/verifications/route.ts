/**
 * GET /api/merchant/verifications
 * List stores pending verification. Requires MERCHANT dashboard access.
 * Agents, Area Managers, and Super Admin with MERCHANT access can view.
 * Scoped by area_manager_id for Area Managers; all for Super Admin / Agents.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { listMerchantStores } from "@/lib/db/operations/merchant-stores";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: sessionError,
    } = await supabase.auth.getUser();

    if (sessionError || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    const hasAccess =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));

    if (!hasAccess) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchant dashboard access required",
          code: "MERCHANT_ACCESS_REQUIRED",
        },
        { status: 403 }
      );
    }

    const systemUser = await getSystemUserByEmail(user.email);
    let areaManagerId: number | null = null;
    if (systemUser && !(await isSuperAdmin(user.id, user.email))) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get("status") as
      | "SUBMITTED"
      | "UNDER_VERIFICATION"
      | undefined;
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "20", 10),
      100
    );
    const cursor = searchParams.get("cursor") ?? undefined;
    const search = searchParams.get("search") ?? undefined;

    const approvalStatus =
      status === "UNDER_VERIFICATION" ? "UNDER_VERIFICATION" : "SUBMITTED";

    const { items, nextCursor } = await listMerchantStores({
      areaManagerId,
      limit,
      cursor,
      search,
      approval_status: approvalStatus,
    });

    const list = items.map((s) => ({
      id: s.id,
      store_id: s.store_id,
      store_name: s.store_name,
      store_display_name: s.store_display_name,
      city: s.city,
      approval_status: s.approval_status,
      current_onboarding_step: s.current_onboarding_step,
      onboarding_completed: s.onboarding_completed,
      created_at: s.created_at,
    }));

    return NextResponse.json({
      success: true,
      items: list,
      nextCursor,
    });
  } catch (e) {
    console.error("[GET /api/merchant/verifications]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
