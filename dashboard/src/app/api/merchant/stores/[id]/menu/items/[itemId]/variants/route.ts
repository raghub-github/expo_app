/**
 * Variants for a menu item. POST /api/merchant/stores/[id]/menu/items/[itemId]/variants
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess, genId } from "../../../assert-store-access";

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
    const variant_name = String(body.variant_name ?? "").trim();
    if (!variant_name) return NextResponse.json({ success: false, error: "variant_name required" }, { status: 400 });
    const variant_price = Number(body.variant_price);
    if (!Number.isFinite(variant_price) || variant_price < 0) {
      return NextResponse.json({ success: false, error: "Valid variant_price required" }, { status: 400 });
    }

    const sql = getSql();
    const [item] = await sql`SELECT id FROM merchant_menu_items WHERE id = ${menuItemId} AND store_id = ${storeId} LIMIT 1`;
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const variantId = genId("VAR_");
    const [row] = await sql`
      INSERT INTO merchant_menu_item_variants (menu_item_id, variant_id, variant_name, variant_type, variant_price, is_default, display_order)
      VALUES (${menuItemId}, ${variantId}, ${variant_name}, ${body.variant_type ?? null}, ${variant_price}, ${body.is_default ?? false}, ${body.display_order ?? 0})
      RETURNING id
    `;
    return NextResponse.json({ success: true, id: Number((row as any)?.id) }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/items/[itemId]/variants]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
