/**
 * PATCH /api/merchant/stores/[id]/menu/items/[itemId]/approval
 * Body: { approval_status: "APPROVED" | "REJECTED" | "PENDING" }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { insertActivityLog } from "@/lib/db/operations/merchant-portal-activity-logs";

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
    if (!allowed) return NextResponse.json({ success: false, error: "Agent or admin access required" }, { status: 403 });

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

    const body = (await request.json().catch(() => ({}))) as { approval_status?: string };
    const st = body.approval_status;
    if (st !== "APPROVED" && st !== "REJECTED" && st !== "PENDING") {
      return NextResponse.json({ success: false, error: "approval_status required" }, { status: 400 });
    }

    const sql = getSql();
    const [prev] = await sql`
      SELECT item_name, approval_status::text AS approval_status
      FROM merchant_menu_items WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    const result = await sql`
      UPDATE merchant_menu_items
      SET approval_status = ${st}::merchant_menu_item_approval_status,
          approved_at = ${st === "APPROVED" ? sql`NOW()` : null},
          approved_by = ${st === "APPROVED" ? user.email : null},
          updated_at = NOW()
      WHERE id = ${menuItemId} AND store_id = ${storeId}
    `;
    if ((result as any)?.count === 0) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });
    const systemUser = await getSystemUserByEmail(user.email);
    const agentId = systemUser?.id ?? null;
    try {
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_items",
        fieldName: "approval_status",
        oldValue: prev ? (prev as any).approval_status : null,
        newValue: st,
        actionType: "update",
      });
    } catch (_logErr) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/menu/items/[itemId]/approval]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

