/**
 * GET /api/merchant/stores/[id]/menu/subcategory-name-suggestions?q=&limit=&parentCategoryId=&editingCategoryId=
 * Names from other stores' subcategories; excludes names already used under the same parent on this store.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { suggestPeerSubcategoryNamesForStore } from "@/lib/db/operations/menu-category-suggestions";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
    }

    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const sp = request.nextUrl.searchParams;
    const parentRaw = sp.get("parentCategoryId");
    const parentParsed =
      parentRaw != null && parentRaw.trim() !== "" ? parseInt(String(parentRaw), 10) : NaN;
    if (!Number.isFinite(parentParsed) || parentParsed <= 0) {
      return NextResponse.json({ success: false, error: "parentCategoryId is required" }, { status: 400 });
    }

    const q = typeof sp.get("q") === "string" ? sp.get("q")! : "";
    const limitRaw = sp.get("limit");
    const limitParsed = limitRaw != null ? parseInt(String(limitRaw), 10) : 12;
    const limit = Number.isFinite(limitParsed) ? limitParsed : 12;
    const editRaw = sp.get("editingCategoryId");
    const editingParsed =
      editRaw != null && editRaw !== "" ? parseInt(String(editRaw), 10) : NaN;
    const editingCategoryId = Number.isFinite(editingParsed) ? editingParsed : null;

    const suggestions = await suggestPeerSubcategoryNamesForStore(storeId, {
      q,
      limit,
      parentCategoryId: parentParsed,
      editingCategoryId,
    });

    return NextResponse.json({ success: true, suggestions });
  } catch (e) {
    console.error("[GET subcategory-name-suggestions]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
