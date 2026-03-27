/**
 * Update/delete a variant. PUT/DELETE /api/merchant/stores/[id]/menu/variants/[variantId]
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id, variantId } = await params;
    const storeId = parseInt(id, 10);
    const vId = parseInt(variantId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(vId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [v] = await sql`
      SELECT v.id, v.menu_item_id, v.variant_name, v.variant_type, v.variant_price, v.is_default, v.display_order, v.in_stock
      FROM merchant_menu_item_variants v
      INNER JOIN merchant_menu_items m ON m.id = v.menu_item_id AND m.store_id = ${storeId}
      WHERE v.id = ${vId}
      LIMIT 1
    `;
    if (!v) return NextResponse.json({ success: false, error: "Variant not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const e = v as any;
    const variant_name = body.variant_name !== undefined ? String(body.variant_name).trim() : e.variant_name;
    if (!variant_name) return NextResponse.json({ success: false, error: "variant_name required" }, { status: 400 });
    const variant_price = body.variant_price !== undefined ? Number(body.variant_price) : Number(e.variant_price);
    if (!Number.isFinite(variant_price) || variant_price < 0) {
      return NextResponse.json({ success: false, error: "Invalid variant_price" }, { status: 400 });
    }

    const variant_type = mergeOptionalStr(body.variant_type, e.variant_type);
    const is_default = mergeBool(body.is_default, e.is_default);
    const display_order = mergeNum(body.display_order, e.display_order);
    const in_stock = mergeBool(body.in_stock, e.in_stock);

    await sql`
      UPDATE merchant_menu_item_variants
      SET variant_name = ${variant_name},
          variant_type = ${variant_type},
          variant_price = ${variant_price},
          is_default = ${is_default},
          display_order = ${display_order},
          in_stock = ${in_stock},
          updated_at = NOW()
      WHERE id = ${vId}
    `;
    try {
      const agentId = await getAgentIdForStore(storeId);
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_item_variants",
        fieldName: "variant",
        oldValue: JSON.stringify({ variant_name: e.variant_name, variant_price: e.variant_price }),
        newValue: JSON.stringify({ variant_name, variant_price }),
        actionType: "update",
      });
    } catch (_logErr) {}
    try {
      await logStoreActivity({ storeId, section: "variant", action: "update", entityId: vId, summary: `Agent updated variant #${vId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[PUT /api/merchant/stores/[id]/menu/variants/[variantId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const { id, variantId } = await params;
    const storeId = parseInt(id, 10);
    const vId = parseInt(variantId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(vId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [v] = await sql`
      SELECT v.id, v.variant_name, v.variant_price, v.menu_item_id FROM merchant_menu_item_variants v
      INNER JOIN merchant_menu_items m ON m.id = v.menu_item_id AND m.store_id = ${storeId}
      WHERE v.id = ${vId}
      LIMIT 1
    `;
    if (!v) return NextResponse.json({ success: false, error: "Variant not found" }, { status: 404 });
    const vRow = v as { id: number; variant_name: string; variant_price: unknown; menu_item_id: number };

    await sql`DELETE FROM merchant_menu_item_variants WHERE id = ${vId}`;
    try {
      const agentId = await getAgentIdForStore(storeId);
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_item_variants",
        fieldName: "variant",
        oldValue: JSON.stringify({ menu_item_id: vRow.menu_item_id, variant_name: vRow.variant_name, variant_price: vRow.variant_price }),
        newValue: null,
        actionType: "delete",
      });
    } catch (_logErr) {}
    try {
      await logStoreActivity({ storeId, section: "variant", action: "delete", entityId: vId, summary: `Agent deleted variant #${vId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/variants/[variantId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
