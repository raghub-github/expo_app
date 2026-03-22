/**
 * Combo components. POST /api/merchant/stores/[id]/menu/combos/[comboId]/components
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../../../assert-store-access";
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
    const quantityRaw = Number(body.quantity);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;
    const displayOrderRaw = Number(body.display_order);
    const displayOrder = Number.isFinite(displayOrderRaw) ? displayOrderRaw : 0;
    const [row] = await sql`
      INSERT INTO merchant_menu_combo_components (combo_id, menu_item_id, variant_id, quantity, display_order)
      VALUES (${cId}, ${menu_item_id}, ${variant_id}, ${quantity}, ${displayOrder})      RETURNING id
    `;
    try {
      const agentId = await getAgentIdForStore(storeId);
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_combo_components",
        fieldName: "combo_component",
        oldValue: null,
        newValue: JSON.stringify({ combo_id: cId, menu_item_id, variant_id, quantity }),
        actionType: "create",
      });
    } catch (_logErr) {}
    try {
      await logStoreActivity({ storeId, section: "combo_component", action: "create", summary: `Agent added item to combo #${cId}`, actorType: "agent", source: "dashboard" });
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

    return NextResponse.json({ success: true, id: Number((row as any)?.id) }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/combos/[comboId]/components]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
