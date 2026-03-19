/**
 * Modifier group update/delete for dashboard store menu.
 * PUT/DELETE /api/merchant/stores/[id]/menu/modifier-groups/[groupId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
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
    const modifierGroupId = parseInt(groupId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(modifierGroupId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sql = getSql();
    const [existing] = await sql`
      SELECT id, title, description, is_required, min_selection, max_selection, display_order
      FROM merchant_modifier_groups
      WHERE id = ${modifierGroupId} AND store_id = ${storeId}
      LIMIT 1
    `;
    if (!existing) return NextResponse.json({ success: false, error: "Modifier group not found" }, { status: 404 });

    const e = existing as any;
    const title = body.title !== undefined ? String(body.title).trim() : e.title;
    if (!title) return NextResponse.json({ success: false, error: "title required" }, { status: 400 });

    await sql`
      UPDATE merchant_modifier_groups
      SET title = ${title},
          description = ${body.description !== undefined ? body.description : e.description},
          is_required = ${body.is_required !== undefined ? body.is_required : e.is_required},
          min_selection = ${body.min_selection !== undefined ? body.min_selection : e.min_selection},
          max_selection = ${body.max_selection !== undefined ? body.max_selection : e.max_selection},
          display_order = ${body.display_order !== undefined ? body.display_order : e.display_order},
          updated_at = NOW()
      WHERE id = ${modifierGroupId} AND store_id = ${storeId}
    `;

    try {
      await logStoreActivity({ storeId, section: "addon", action: "update", entityId: modifierGroupId, summary: `Agent updated modifier group #${modifierGroupId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[PUT /api/merchant/stores/[id]/menu/modifier-groups/[groupId]]", e);
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
    const modifierGroupId = parseInt(groupId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(modifierGroupId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [existing] = await sql`
      SELECT id FROM merchant_modifier_groups WHERE id = ${modifierGroupId} AND store_id = ${storeId} LIMIT 1
    `;
    if (!existing) return NextResponse.json({ success: false, error: "Modifier group not found" }, { status: 404 });

    // Deleting group will cascade delete options and item links.
    await sql`DELETE FROM merchant_modifier_groups WHERE id = ${modifierGroupId} AND store_id = ${storeId}`;
    try {
      await logStoreActivity({ storeId, section: "addon", action: "delete", entityId: modifierGroupId, summary: `Agent deleted modifier group #${modifierGroupId}`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/modifier-groups/[groupId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

