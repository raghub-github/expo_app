/**
 * Variants for a menu item. POST /api/merchant/stores/[id]/menu/items/[itemId]/variants
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { bodyBool, bodyNum, bodyOptionalStr } from "@/lib/db/sql-json-body";
import { assertStoreAccess, genId } from "../../../assert-store-access";
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

    const variant_type = bodyOptionalStr(body.variant_type);
    const is_default = bodyBool(body.is_default, false);
    const display_order = bodyNum(body.display_order, 0);

    const variantId = genId("VAR_");
    const variantType =
      body.variant_type != null && String(body.variant_type).trim() !== ""
        ? String(body.variant_type)
        : null;
    const isDefault = body.is_default === true;
    const displayOrderRaw = Number(body.display_order);
    const displayOrder = Number.isFinite(displayOrderRaw) ? displayOrderRaw : 0;
    const [row] = await sql`
      INSERT INTO merchant_menu_item_variants (menu_item_id, variant_id, variant_name, variant_type, variant_price, is_default, display_order)
      VALUES (${menuItemId}, ${variantId}, ${variant_name}, ${variantType}, ${variant_price}, ${isDefault}, ${displayOrder})      RETURNING id
    `;
    try {
      const agentId = await getAgentIdForStore(storeId);
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_item_variants",
        fieldName: "variant",
        oldValue: null,
        newValue: JSON.stringify({ menu_item_id: menuItemId, variant_name, variant_price }),
        actionType: "create",
      });
    } catch (_logErr) {}
    try {
      await logStoreActivity({ storeId, section: "variant", action: "create", entityName: variant_name, summary: `Agent added variant "${variant_name}" to item #${itemId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, id: Number((row as any)?.id) }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/items/[itemId]/variants]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
