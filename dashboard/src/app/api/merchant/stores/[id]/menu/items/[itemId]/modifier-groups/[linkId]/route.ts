/**
 * Unlink modifier group from item.
 * DELETE /api/merchant/stores/[id]/menu/items/[itemId]/modifier-groups/[linkId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../../../../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string; linkId: string }> }
) {
  try {
    const { id, itemId, linkId } = await params;
    const storeId = parseInt(id, 10);
    const menuItemId = parseInt(itemId, 10);
    const linkRowId = parseInt(linkId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(menuItemId) || !Number.isFinite(linkRowId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [item] = await sql`SELECT id FROM merchant_menu_items WHERE id = ${menuItemId} AND store_id = ${storeId}`;
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const [r] = await sql`
      SELECT id FROM merchant_item_modifier_groups
      WHERE id = ${linkRowId} AND menu_item_id = ${menuItemId}
      LIMIT 1
    `;
    if (!r) return NextResponse.json({ success: false, error: "Link not found" }, { status: 404 });

    await sql`DELETE FROM merchant_item_modifier_groups WHERE id = ${linkRowId}`;
    try {
      await logStoreActivity({ storeId, section: "addon", action: "unlink", summary: `Agent unlinked modifier group from item #${itemId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/items/[itemId]/modifier-groups/[linkId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

