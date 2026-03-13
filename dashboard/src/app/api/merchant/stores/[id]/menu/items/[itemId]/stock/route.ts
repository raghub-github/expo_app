/**
 * PATCH /api/merchant/stores/[id]/menu/items/[itemId]/stock
 * Body: { in_stock: boolean }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

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

    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as { in_stock?: boolean };
    if (typeof body.in_stock !== "boolean") {
      return NextResponse.json({ success: false, error: "in_stock boolean required" }, { status: 400 });
    }

    const sql = getSql();
    const result = await sql`
      UPDATE merchant_menu_items
      SET in_stock = ${body.in_stock}, updated_at = NOW()
      WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    if ((result as any)?.count === 0) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/menu/items/[itemId]/stock]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

