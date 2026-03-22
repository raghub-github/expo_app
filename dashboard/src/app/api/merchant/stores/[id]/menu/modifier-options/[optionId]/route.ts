/**
 * Modifier option update/delete.
 * PUT/DELETE /api/merchant/stores/[id]/menu/modifier-options/[optionId]
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { mergeBool, mergeNum, mergeOptionalStr } from "@/lib/db/sql-json-body";
import { assertStoreAccess } from "../../assert-store-access";

export const runtime = "nodejs";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  try {
    const { id, optionId } = await params;
    const storeId = parseInt(id, 10);
    const optId = parseInt(optionId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(optId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const sql = getSql();
    const [existing] = await sql`
      SELECT o.id, o.name, o.price_delta, o.image_url, o.in_stock, o.default_quantity, o.display_order, o.modifier_group_id
      FROM merchant_modifier_options o
      INNER JOIN merchant_modifier_groups g ON g.id = o.modifier_group_id AND g.store_id = ${storeId}
      WHERE o.id = ${optId}
      LIMIT 1
    `;
    if (!existing) return NextResponse.json({ success: false, error: "Modifier option not found" }, { status: 404 });
    const e = existing as any;

    const name = body.name !== undefined ? String(body.name).trim() : e.name;
    if (!name) return NextResponse.json({ success: false, error: "name required" }, { status: 400 });
    const price_delta = body.price_delta !== undefined ? Number(body.price_delta) : Number(e.price_delta ?? 0);
    if (!Number.isFinite(price_delta) || price_delta < 0) {
      return NextResponse.json({ success: false, error: "Invalid price_delta" }, { status: 400 });
    }

    const image_url = mergeOptionalStr(body.image_url, e.image_url);
    const in_stock = mergeBool(body.in_stock, e.in_stock);
    const default_quantity = mergeNum(body.default_quantity, e.default_quantity);
    const display_order = mergeNum(body.display_order, e.display_order);

    await sql`
      UPDATE merchant_modifier_options
      SET name = ${name},
          price_delta = ${price_delta},
          image_url = ${image_url},
          in_stock = ${in_stock},
          default_quantity = ${default_quantity},
          display_order = ${display_order},
          updated_at = NOW()
      WHERE id = ${optId}
    `;
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[PUT /api/merchant/stores/[id]/menu/modifier-options/[optionId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; optionId: string }> }
) {
  try {
    const { id, optionId } = await params;
    const storeId = parseInt(id, 10);
    const optId = parseInt(optionId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(optId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const [existing] = await sql`
      SELECT o.id
      FROM merchant_modifier_options o
      INNER JOIN merchant_modifier_groups g ON g.id = o.modifier_group_id AND g.store_id = ${storeId}
      WHERE o.id = ${optId}
      LIMIT 1
    `;
    if (!existing) return NextResponse.json({ success: false, error: "Modifier option not found" }, { status: 404 });

    await sql`DELETE FROM merchant_modifier_options WHERE id = ${optId}`;
    return NextResponse.json({ success: true, ok: true });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/menu/modifier-options/[optionId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

