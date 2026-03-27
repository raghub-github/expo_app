/**
 * Update/delete a customization group. PUT/DELETE /api/merchant/stores/[id]/menu/customization-groups/[groupId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { mergeBool, mergeNum } from "@/lib/db/sql-json-body";
import { assertStoreAccess } from "../../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

export async function PUT(
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

    const sql = getSql();
    const [g] = await sql`
      SELECT c.id, c.customization_title, c.is_required, c.min_selection, c.max_selection, c.display_order
      FROM merchant_menu_item_customizations c
      INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeId}
      WHERE c.id = ${gId}
      LIMIT 1
    `;
    if (!g) return NextResponse.json({ success: false, error: "Customization group not found" }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const e = g as any;
    const customization_title = body.customization_title !== undefined ? String(body.customization_title).trim() : e.customization_title;
    if (!customization_title) {
      return NextResponse.json({ success: false, error: "customization_title required" }, { status: 400 });
    }

    const is_required = mergeBool(body.is_required, e.is_required);
    const min_selection = mergeNum(body.min_selection, e.min_selection);
    const max_selection = mergeNum(body.max_selection, e.max_selection);
    const display_order = mergeNum(body.display_order, e.display_order);

    await sql`
      UPDATE merchant_menu_item_customizations
      SET customization_title = ${customization_title},
          is_required = ${is_required},
          min_selection = ${min_selection},
          max_selection = ${max_selection},
          display_order = ${display_order},
          updated_at = NOW()
      WHERE id = ${gId}
    `;
    try {
      await logStoreActivity({ storeId, section: "customization", action: "update", entityId: gId, summary: `Agent updated customization group #${gId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[PUT /api/merchant/stores/[id]/menu/customization-groups/[groupId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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

    const sql = getSql();
    const [g] = await sql`
      SELECT c.id FROM merchant_menu_item_customizations c
      INNER JOIN merchant_menu_items m ON m.id = c.menu_item_id AND m.store_id = ${storeId}
      WHERE c.id = ${gId}
      LIMIT 1
    `;
    if (!g) return NextResponse.json({ success: false, error: "Customization group not found" }, { status: 404 });

    await sql`DELETE FROM merchant_menu_item_customizations WHERE id = ${gId}`;
    try {
      await logStoreActivity({ storeId, section: "customization", action: "delete", entityId: gId, summary: `Agent deleted customization group #${gId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/customization-groups/[groupId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
