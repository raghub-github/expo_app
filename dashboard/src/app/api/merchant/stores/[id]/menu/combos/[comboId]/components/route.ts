/**
 * Combo components. POST /api/merchant/stores/[id]/menu/combos/[comboId]/components
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../../../assert-store-access";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; comboId: string }> }
) {
  try {
    const { id, comboId } = await params;
    const storeId = parseInt(id, 10);
    const cId = parseInt(comboId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(cId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const menu_item_id = Number(body.menu_item_id);
    if (!Number.isFinite(menu_item_id)) {
      return NextResponse.json({ success: false, error: "menu_item_id required" }, { status: 400 });
    }

    const sql = getSql();
    const [combo] = await sql`SELECT id FROM merchant_menu_combos WHERE id = ${cId} AND store_id = ${storeId}`;
    if (!combo) return NextResponse.json({ success: false, error: "Combo not found" }, { status: 404 });
    const [item] = await sql`SELECT id FROM merchant_menu_items WHERE id = ${menu_item_id} AND store_id = ${storeId}`;
    if (!item) return NextResponse.json({ success: false, error: "Menu item not found" }, { status: 404 });

    const variant_id = body.variant_id != null ? Number(body.variant_id) : null;
    const [row] = await sql`
      INSERT INTO merchant_menu_combo_components (combo_id, menu_item_id, variant_id, quantity, display_order)
      VALUES (${cId}, ${menu_item_id}, ${variant_id}, ${body.quantity ?? 1}, ${body.display_order ?? 0})
      RETURNING id
    `;
    return NextResponse.json({ success: true, id: Number((row as any)?.id) }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/combos/[comboId]/components]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
