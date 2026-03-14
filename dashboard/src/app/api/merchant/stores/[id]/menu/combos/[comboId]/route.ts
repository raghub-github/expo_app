/**
 * Single combo. GET/PUT/DELETE /api/merchant/stores/[id]/menu/combos/[comboId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../../assert-store-access";

export const runtime = "nodejs";

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
    const components = await sql`
      SELECT id, menu_item_id, variant_id, quantity, display_order
      FROM merchant_menu_combo_components WHERE combo_id = ${cId} ORDER BY display_order ASC, id ASC
    `;
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

    await sql`
      UPDATE merchant_menu_combos
      SET combo_name = ${combo_name},
          description = ${body.description !== undefined ? body.description : e.description},
          combo_price = ${combo_price},
          image_url = ${body.image_url !== undefined ? body.image_url : e.image_url},
          is_active = ${body.is_active !== undefined ? body.is_active : e.is_active},
          display_order = ${body.display_order !== undefined ? body.display_order : e.display_order},
          updated_at = NOW()
      WHERE id = ${cId} AND store_id = ${storeId}
    `;
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
    const [c] = await sql`SELECT id FROM merchant_menu_combos WHERE id = ${cId} AND store_id = ${storeId}`;
    if (!c) return NextResponse.json({ success: false, error: "Combo not found" }, { status: 404 });

    await sql`UPDATE merchant_menu_combos SET is_deleted = true, updated_at = NOW() WHERE id = ${cId} AND store_id = ${storeId}`;
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/combos/[comboId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
