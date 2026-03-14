/**
 * Delete combo component. DELETE /api/merchant/stores/[id]/menu/combos/[comboId]/components/[componentId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../../../../assert-store-access";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; comboId: string; componentId: string }> }
) {
  try {
    const { id, comboId, componentId } = await params;
    const storeId = parseInt(id, 10);
    const cId = parseInt(comboId, 10);
    const compId = parseInt(componentId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(cId) || !Number.isFinite(compId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [comp] = await sql`
      SELECT cc.id FROM merchant_menu_combo_components cc
      INNER JOIN merchant_menu_combos c ON c.id = cc.combo_id AND c.store_id = ${storeId}
      WHERE cc.id = ${compId} AND cc.combo_id = ${cId}
    `;
    if (!comp) return NextResponse.json({ success: false, error: "Component not found" }, { status: 404 });

    await sql`DELETE FROM merchant_menu_combo_components WHERE id = ${compId}`;
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/combos/[comboId]/components/[componentId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
