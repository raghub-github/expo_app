/**
 * Single combo. GET/PUT/DELETE /api/merchant/stores/[id]/menu/combos/[comboId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { mergeBool, mergeNum, mergeOptionalStr } from "@/lib/db/sql-json-body";
import { assertStoreAccess } from "../../assert-store-access";
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

export async function GET(
  _request: NextRequest,
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

    const sql = getSql();
    const [c] = await sql`
      SELECT id, combo_name, description, combo_price::text, image_url, is_active, is_deleted, display_order
      FROM merchant_menu_combos WHERE id = ${cId} AND store_id = ${storeId}
    `;
    if (!c) return NextResponse.json({ success: false, error: "Combo not found" }, { status: 404 });
    const componentsRaw = await sql`
      SELECT cc.id,
             cc.menu_item_id,
             cc.variant_id,
             cc.quantity,
             cc.display_order,
             mi.item_name,
             mi.item_image_url,
             mi.selling_price,
             v.variant_name,
             v.variant_price
      FROM merchant_menu_combo_components cc
      LEFT JOIN merchant_menu_items mi ON mi.id = cc.menu_item_id AND mi.store_id = ${storeId}
      LEFT JOIN merchant_menu_item_variants v ON v.id = cc.variant_id
      WHERE cc.combo_id = ${cId}
      ORDER BY cc.display_order ASC, cc.id ASC
    `;
    const components = (Array.isArray(componentsRaw) ? componentsRaw : [componentsRaw]).map((row: any) => ({
      id: row.id,
      menu_item_id: row.menu_item_id,
      variant_id: row.variant_id,
      quantity: row.quantity,
      display_order: row.display_order,
      item_name: row.item_name ?? null,
      variant_name: row.variant_name ?? null,
      item_image_url: row.item_image_url ?? null,
      item_price: row.selling_price != null ? Number(row.selling_price) : null,
      variant_price: row.variant_price != null ? Number(row.variant_price) : null,
    }));
    return NextResponse.json({ success: true, combo: { ...(c as any), components } });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu/combos/[comboId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(
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
    const sql = getSql();
    const [existing] = await sql`
      SELECT combo_name, description, combo_price, image_url, is_active, display_order
      FROM merchant_menu_combos WHERE id = ${cId} AND store_id = ${storeId}
    `;
    if (!existing) return NextResponse.json({ success: false, error: "Combo not found" }, { status: 404 });
    const e = existing as any;
    const combo_name = body.combo_name !== undefined ? String(body.combo_name).trim() : e.combo_name;
    if (!combo_name) return NextResponse.json({ success: false, error: "combo_name required" }, { status: 400 });
    const combo_price = body.combo_price !== undefined ? Number(body.combo_price) : Number(e.combo_price);
    if (!Number.isFinite(combo_price) || combo_price < 0) {
      return NextResponse.json({ success: false, error: "Invalid combo_price" }, { status: 400 });
    }

    const description = mergeOptionalStr(body.description, e.description);
    const image_url = mergeOptionalStr(body.image_url, e.image_url);
    const is_active = mergeBool(body.is_active, e.is_active);
    const display_order = mergeNum(body.display_order, e.display_order);

    await sql`
      UPDATE merchant_menu_combos
      SET combo_name = ${combo_name},
          description = ${description},
          combo_price = ${combo_price},
          image_url = ${image_url},
          is_active = ${is_active},
          display_order = ${display_order},
          updated_at = NOW()
      WHERE id = ${cId} AND store_id = ${storeId}
    `;
    try {
      const agentId = await getAgentIdForStore(storeId);
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_combos",
        fieldName: "combo",
        oldValue: JSON.stringify({ combo_name: e.combo_name, description: e.description, combo_price: Number(e.combo_price) }),
        newValue: JSON.stringify({ combo_name, description: body.description !== undefined ? body.description : e.description, combo_price }),
        actionType: "update",
      });
    } catch (_logErr) {}
    try {
      await logStoreActivity({ storeId, section: "combo", action: "update", entityId: cId, summary: `Agent updated combo #${cId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (err) {
    console.error("[PUT /api/merchant/stores/[id]/menu/combos/[comboId]]", err);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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

    const sql = getSql();
    const [c] = await sql`SELECT id, combo_name, combo_price FROM merchant_menu_combos WHERE id = ${cId} AND store_id = ${storeId}`;
    if (!c) return NextResponse.json({ success: false, error: "Combo not found" }, { status: 404 });
    const comboRow = c as { id: number; combo_name: string; combo_price: unknown };

    await sql`UPDATE merchant_menu_combos SET is_deleted = true, updated_at = NOW() WHERE id = ${cId} AND store_id = ${storeId}`;
    try {
      const agentId = await getAgentIdForStore(storeId);
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_combos",
        fieldName: "combo",
        oldValue: JSON.stringify({ combo_name: comboRow.combo_name, combo_price: comboRow.combo_price }),
        newValue: null,
        actionType: "delete",
      });
    } catch (_logErr) {}
    try {
      await logStoreActivity({ storeId, section: "combo", action: "delete", entityId: cId, summary: `Agent deleted combo #${cId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/combos/[comboId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
