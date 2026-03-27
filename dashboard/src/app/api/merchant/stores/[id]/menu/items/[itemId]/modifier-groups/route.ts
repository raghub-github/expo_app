/**
 * Item ↔ modifier group linking for dashboard store menu.
 * GET/POST /api/merchant/stores/[id]/menu/items/[itemId]/modifier-groups
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { bodyNum } from "@/lib/db/sql-json-body";
import { assertStoreAccess, getModifierLimits } from "../../../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
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

    const sql = getSql();
    const [item] = await sql`SELECT id FROM merchant_menu_items WHERE id = ${menuItemId} AND store_id = ${storeId}`;
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const links = (await sql`
      SELECT id, modifier_group_id, display_order
      FROM merchant_item_modifier_groups
      WHERE menu_item_id = ${menuItemId}
      ORDER BY display_order ASC, id ASC
    `) as any[];

    const result: any[] = [];
    for (const link of links) {
      const [g] = await sql`
        SELECT id, group_code, title, description, is_required, min_selection, max_selection
        FROM merchant_modifier_groups
        WHERE id = ${link.modifier_group_id} AND store_id = ${storeId}
      `;
      if (!g) continue;
      const optRows = (await sql`
        SELECT id, option_code, name, price_delta::text, in_stock, display_order
        FROM merchant_modifier_options
        WHERE modifier_group_id = ${link.modifier_group_id}
        ORDER BY display_order ASC, id ASC
      `) as any[];
      const gAny = g as any;
      result.push({
        id: link.id,
        modifier_group_id: link.modifier_group_id,
        display_order: link.display_order,
        group: { ...gAny, group_id: gAny.group_code ?? gAny.group_id, options: optRows.map((o: any) => ({ ...o, option_id: o.option_code ?? o.option_id })) },
      });
    }

    return NextResponse.json({ success: true, linkedModifierGroups: result });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu/items/[itemId]/modifier-groups]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
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
    const modifier_group_id = Number(body.modifier_group_id);
    if (!Number.isFinite(modifier_group_id)) {
      return NextResponse.json({ success: false, error: "modifier_group_id required" }, { status: 400 });
    }

    const sql = getSql();
    const [item] = await sql`SELECT id FROM merchant_menu_items WHERE id = ${menuItemId} AND store_id = ${storeId}`;
    if (!item) return NextResponse.json({ success: false, error: "Item not found" }, { status: 404 });

    const [g] = await sql`SELECT id FROM merchant_modifier_groups WHERE id = ${modifier_group_id} AND store_id = ${storeId}`;
    if (!g) return NextResponse.json({ success: false, error: "MODIFIER_GROUP_NOT_FOUND" }, { status: 404 });

    const limits = await getModifierLimits(storeId);
    const [countRow] = await sql`SELECT COUNT(*)::int AS c FROM merchant_item_modifier_groups WHERE menu_item_id = ${menuItemId}`;
    if (Number((countRow as any)?.c ?? 0) >= limits.max_modifier_groups_per_item) {
      return NextResponse.json(
        { success: false, error: `LIMIT_GROUPS_PER_ITEM: Maximum ${limits.max_modifier_groups_per_item} addon groups per item.` },
        { status: 403 }
      );
    }
    const [existing] = await sql`
      SELECT id FROM merchant_item_modifier_groups WHERE menu_item_id = ${menuItemId} AND modifier_group_id = ${modifier_group_id}
    `;
    if (existing) return NextResponse.json({ success: false, error: "ALREADY_LINKED" }, { status: 409 });

    const displayOrderRaw = Number(body.display_order);
    const displayOrder = Number.isFinite(displayOrderRaw) ? displayOrderRaw : 0;
    const [row] = await sql`
      INSERT INTO merchant_item_modifier_groups (menu_item_id, modifier_group_id, display_order)
      VALUES (${menuItemId}, ${modifier_group_id}, ${displayOrder})      RETURNING id
    `;
    try {
      await logStoreActivity({ storeId, section: "addon", action: "link", summary: `Agent linked modifier group to item #${itemId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, id: Number((row as any)?.id) }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/items/[itemId]/modifier-groups]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

