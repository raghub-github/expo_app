/**
 * GET /api/admin/parent-area-managers/search?q=...
 * Search parent merchants or child stores by ID or name for AM assignment.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { searchParentsAndStores } from "@/lib/db/operations/parent-area-managers";

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
    const hasMerchantAccess = await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT");
    if (!superAdmin && !hasMerchantAccess) {
      return NextResponse.json(
        { success: false, error: "Admin or Super Admin access required" },
        { status: 403 }
      );
    }

    const q = request.nextUrl.searchParams.get("q") ?? "";
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "20", 10), 50);
    const results = await searchParentsAndStores(q, limit);

    return NextResponse.json({ success: true, results });
  } catch (e) {
    console.error("[GET /api/admin/parent-area-managers/search]", e);
    return NextResponse.json({ success: false, error: "Search failed" }, { status: 500 });
  }
}

