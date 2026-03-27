/**
 * Addon options under a customization group. POST /api/merchant/stores/[id]/menu/customization-groups/[groupId]/options
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess, genId } from "../../../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; groupId: string }> }
) {
  try {
    const { id, groupId } = await params;
    const storeId = parseInt(id, 10);
    const gId = parseInt(groupId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(gId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const addon_name = String(body.addon_name ?? "").trim();
    if (!addon_name) return NextResponse.json({ success: false, error: "addon_name required" }, { status: 400 });
    const addon_price = body.addon_price != null ? Number(body.addon_price) : 0;
    if (!Number.isFinite(addon_price) || addon_price < 0) {
      return NextResponse.json({ success: false, error: "Invalid addon_price" }, { status: 400 });
    }

    const sql = getSql();
    const [g] = await sql`
      SELECT c.id FROM merchant_menu_item_customizations c
      INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeId}
      WHERE c.id = ${gId}
      LIMIT 1
    `;
    if (!g) return NextResponse.json({ success: false, error: "Customization group not found" }, { status: 404 });

    const addon_image_url = body.addon_image_url != null ? String(body.addon_image_url) : null;
    const in_stock = body.in_stock === false ? false : true;
    const display_order = Number(body.display_order) || 0;

    const addonId = genId("ADN_");
    const addonImageUrl =
      body.addon_image_url != null && String(body.addon_image_url).trim() !== ""
        ? String(body.addon_image_url)
        : null;
    const inStock = typeof body.in_stock === "boolean" ? body.in_stock : true;
    const displayOrderRaw = Number(body.display_order);
    const displayOrder = Number.isFinite(displayOrderRaw) ? displayOrderRaw : 0;
    const [row] = await sql`
      INSERT INTO merchant_menu_item_addons (customization_id, addon_id, addon_name, addon_price, addon_image_url, in_stock, display_order)
      VALUES (${gId}, ${addonId}, ${addon_name}, ${addon_price}, ${addonImageUrl}, ${inStock}, ${displayOrder})      RETURNING id
    `;
    try {
      await logStoreActivity({ storeId, section: "addon", action: "create", summary: `Agent added addon option to group #${groupId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, id: Number((row as any)?.id) }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/customization-groups/[groupId]/options]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
