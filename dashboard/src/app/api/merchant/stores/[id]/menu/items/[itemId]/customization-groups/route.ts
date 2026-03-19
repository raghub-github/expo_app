/**
 * Customization groups for a menu item. POST /api/merchant/stores/[id]/menu/items/[itemId]/customization-groups
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess, genId } from "../../../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

export async function POST(
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
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const customization_title = String(body.customization_title ?? "").trim();
    if (!customization_title) {
      return NextResponse.json({ success: false, error: "customization_title required" }, { status: 400 });
    }

    const sql = getSql();
    const [item] = await sql`SELECT id FROM merchant_menu_items WHERE id = ${menuItemId} AND store_id = ${storeId} LIMIT 1`;
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const customizationId = genId("CUST_");
    const [row] = await sql`
      INSERT INTO merchant_menu_item_customizations (menu_item_id, customization_id, customization_title, customization_type, is_required, min_selection, max_selection, display_order)
      VALUES (${menuItemId}, ${customizationId}, ${customization_title}, ${body.customization_type ?? null}, ${body.is_required ?? false}, ${body.min_selection ?? 0}, ${body.max_selection ?? 1}, ${body.display_order ?? 0})
      RETURNING id, customization_id
    `;
    try {
      await logStoreActivity({ storeId, section: "customization", action: "create", summary: `Agent added customization group to item #${itemId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({
      success: true,
      id: Number((row as any)?.id),
      customization_id: (row as any)?.customization_id,
    }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/items/[itemId]/customization-groups]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
