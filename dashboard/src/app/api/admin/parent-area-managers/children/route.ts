import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  isSuperAdmin,
  hasDashboardAccessByAuth,
} from "@/lib/permissions/engine";
import { listChildStoresWithAssignedAm } from "@/lib/db/operations/parent-area-managers";

export const runtime = "nodejs";

async function assertAdminOrSuperAdmin(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.email) {
    return {
      ok: false as const,
      status: 401,
      error: "Not authenticated",
      user: null as any,
    };
  }

  const superAdmin = await isSuperAdmin(user.id, user.email);
  const hasMerchantAccess = await hasDashboardAccessByAuth(
    user.id,
    user.email,
    "MERCHANT"
  );
  if (!superAdmin && !hasMerchantAccess) {
    return {
      ok: false as const,
      status: 403,
      error: "Admin or Super Admin access required",
      user: null as any,
    };
  }

  return { ok: true as const, user };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await assertAdminOrSuperAdmin(request);
    if (!auth.ok) {
      return NextResponse.json(
        { success: false, error: auth.error },
        { status: auth.status }
      );
    }

    const parentIdParam = request.nextUrl.searchParams.get("parentId");
    const parentId = parentIdParam != null ? Number(parentIdParam) : null;
    if (!parentId || !Number.isFinite(parentId)) {
      return NextResponse.json(
        { success: false, error: "parentId is required" },
        { status: 400 }
      );
    }

    const items = await listChildStoresWithAssignedAm(parentId);
    return NextResponse.json({
      success: true,
      items,
      count: items.length,
    });
  } catch (e) {
    console.error("[GET /api/admin/parent-area-managers/children]", e);
    return NextResponse.json(
      { success: false, error: "Failed to load child stores" },
      { status: 500 }
    );
  }
}

