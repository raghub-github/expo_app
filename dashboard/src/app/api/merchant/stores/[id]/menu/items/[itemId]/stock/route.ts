/**
 * PATCH /api/merchant/stores/[id]/menu/items/[itemId]/stock
 * Body: { in_stock: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { patchMenuItemStockToggle } from "@/lib/merchant-menu-out-of-stock-server";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id, itemId } = await params;
    const storeId = parseInt(id, 10);
    const menuItemId = parseInt(itemId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(menuItemId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { in_stock?: boolean };
    if (typeof body.in_stock !== "boolean") {
      return NextResponse.json({ success: false, error: "in_stock boolean required" }, { status: 400 });
    }

    const result = await patchMenuItemStockToggle(storeId, menuItemId, body.in_stock);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/menu/items/[itemId]/stock]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

