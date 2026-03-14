/**
 * Update/delete a variant. PUT/DELETE /api/merchant/stores/[id]/menu/variants/[variantId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../../assert-store-access";

export const runtime = "nodejs";

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

    await sql`
      UPDATE merchant_menu_item_variants
      SET variant_name = ${variant_name},
          variant_type = ${body.variant_type !== undefined ? body.variant_type : e.variant_type},
          variant_price = ${variant_price},
          is_default = ${body.is_default !== undefined ? body.is_default : e.is_default},
          display_order = ${body.display_order !== undefined ? body.display_order : e.display_order},
          in_stock = ${body.in_stock !== undefined ? body.in_stock : e.in_stock},
          updated_at = NOW()
      WHERE id = ${vId}
    `;
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
      SELECT v.id FROM merchant_menu_item_variants v
      INNER JOIN merchant_menu_items m ON m.id = v.menu_item_id AND m.store_id = ${storeId}
      WHERE v.id = ${vId}
      LIMIT 1
    `;
    if (!v) return NextResponse.json({ success: false, error: "Variant not found" }, { status: 404 });

    await sql`DELETE FROM merchant_menu_item_variants WHERE id = ${vId}`;
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/variants/[variantId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
