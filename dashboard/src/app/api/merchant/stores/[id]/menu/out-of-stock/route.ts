/**
 * PATCH /api/merchant/stores/[id]/menu/out-of-stock
 * Body: { targetType: 'item'|'category'|'combo', id, mode, hours?, until? }
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import {
  patchMenuOutOfStock,
  type MenuOosMode,
  type MenuOosPatchBody,
} from "@/lib/merchant-menu-out-of-stock-server";

export const runtime = "nodejs";

export async function PATCH(
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

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const targetType =
      body.targetType === "category" ? "category" : body.targetType === "combo" ? "combo" : "item";
    const mode = body.mode as MenuOosMode;
    if (!mode || !["CLEAR", "MANUAL", "HOURS", "NEXT_OPEN", "CUSTOM"].includes(mode)) {
      return NextResponse.json({ success: false, error: "Valid mode required" }, { status: 400 });
    }

    const patchBody: MenuOosPatchBody = {
      targetType,
      id: (body.id ?? body.item_id ?? body.categoryId ?? body.comboId) as string | number,
      mode,
      hours: typeof body.hours === "number" ? body.hours : undefined,
      until: typeof body.until === "string" ? body.until : undefined,
    };

    const result = await patchMenuOutOfStock(storeId, patchBody);

    try {
      const section =
        targetType === "category" ? "menu_category" : targetType === "combo" ? "combo" : "menu_item";
      await logStoreActivity({
        storeId,
        section,
        action: "update",
        entityId: typeof patchBody.id === "number" ? patchBody.id : null,
        summary: `Dashboard updated out-of-stock (${targetType}, mode=${mode})`,
        actorType: "agent",
        source: "dashboard",
      });
    } catch {
      /* non-blocking */
    }

    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Internal error";
    const status =
      msg === "invalid_hours" || msg === "invalid_until" || msg === "invalid_mode"
        ? 400
        : msg === "next_open_not_available"
          ? 400
          : msg.endsWith("_not_found") || msg.endsWith("_required")
            ? 404
            : 500;
    console.error("[PATCH /api/merchant/stores/[id]/menu/out-of-stock]", e);
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
