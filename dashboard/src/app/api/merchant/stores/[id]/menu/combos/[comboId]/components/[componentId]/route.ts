/**
 * Delete combo component. DELETE /api/merchant/stores/[id]/menu/combos/[comboId]/components/[componentId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../../../../assert-store-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { insertActivityLog } from "@/lib/db/operations/merchant-portal-activity-logs";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

async function getAgentIdForStore(storeId: number): Promise<number | null> {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return null;
  const systemUser = await getSystemUserByEmail(user.email);
  return systemUser?.id ?? null;
}

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
      SELECT cc.id, cc.menu_item_id, cc.variant_id, cc.quantity FROM merchant_menu_combo_components cc
      INNER JOIN merchant_menu_combos c ON c.id = cc.combo_id AND c.store_id = ${storeId}
      WHERE cc.id = ${compId} AND cc.combo_id = ${cId}
    `;
    if (!comp) return NextResponse.json({ success: false, error: "Component not found" }, { status: 404 });
    const compRow = comp as { id: number; menu_item_id: number; variant_id: number | null; quantity: number };

    await sql`DELETE FROM merchant_menu_combo_components WHERE id = ${compId}`;
    try {
      const agentId = await getAgentIdForStore(storeId);
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_combo_components",
        fieldName: "combo_component",
        oldValue: JSON.stringify({ combo_id: cId, menu_item_id: compRow.menu_item_id, variant_id: compRow.variant_id, quantity: compRow.quantity }),
        newValue: null,
        actionType: "delete",
      });
    } catch (_logErr) {}
    try {
      await logStoreActivity({ storeId, section: "combo_component", action: "delete", summary: `Agent removed item from combo #${cId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}

    // Backend-derived combo_price: SUM(menu_item.selling_price * quantity)
    const [priceRow] = await sql`
      SELECT COALESCE(SUM(m.selling_price::numeric * cc.quantity), 0)::numeric AS derived_price
      FROM merchant_menu_combo_components cc
      INNER JOIN merchant_menu_items m ON m.id = cc.menu_item_id AND m.store_id = ${storeId}
      WHERE cc.combo_id = ${cId}
    `;
    const derivedPrice = (priceRow as any)?.derived_price ?? 0;
    await sql`
      UPDATE merchant_menu_combos
      SET combo_price = ${derivedPrice},
          updated_at = NOW()
      WHERE id = ${cId} AND store_id = ${storeId}
    `;

    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/combos/[comboId]/components/[componentId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
