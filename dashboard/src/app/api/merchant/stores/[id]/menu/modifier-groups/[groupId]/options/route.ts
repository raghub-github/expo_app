/**
 * Modifier options CRUD under a modifier group.
 * GET/POST /api/merchant/stores/[id]/menu/modifier-groups/[groupId]/options
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { bodyBool, bodyNum, bodyOptionalStr } from "@/lib/db/sql-json-body";
import { assertStoreAccess, genId, getModifierLimits } from "../../../assert-store-access";

export const runtime = "nodejs";

export async function GET(
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
    const [g] = await sql`SELECT id FROM merchant_modifier_groups WHERE id = ${modifierGroupId} AND store_id = ${storeId}`;
    if (!g) return NextResponse.json({ success: false, error: "Modifier group not found" }, { status: 404 });

    const options = await sql`
      SELECT id, option_code, name, price_delta::text, image_url, in_stock, default_quantity, display_order
      FROM merchant_modifier_options
      WHERE modifier_group_id = ${modifierGroupId}
      ORDER BY display_order ASC, id ASC
    `;
    const optionsWithId = (options as any[]).map((o) => ({ ...o, option_id: o.option_code }));
    return NextResponse.json({ success: true, options: optionsWithId });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu/modifier-groups/[groupId]/options]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(
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
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ success: false, error: "name required" }, { status: 400 });
    const price_delta = body.price_delta != null ? Number(body.price_delta) : 0;
    if (!Number.isFinite(price_delta) || price_delta < 0) {
      return NextResponse.json({ success: false, error: "Invalid price_delta" }, { status: 400 });
    }

    const sql = getSql();
    const [g] = await sql`SELECT id FROM merchant_modifier_groups WHERE id = ${modifierGroupId} AND store_id = ${storeId}`;
    if (!g) return NextResponse.json({ success: false, error: "Modifier group not found" }, { status: 404 });

    const limits = await getModifierLimits(storeId);
    const [perGroup] = await sql`SELECT COUNT(*)::int AS c FROM merchant_modifier_options WHERE modifier_group_id = ${modifierGroupId}`;
    if (Number((perGroup as any)?.c ?? 0) >= limits.max_options_per_group) {
      return NextResponse.json(
        { success: false, error: `LIMIT_OPTIONS_PER_GROUP: Maximum ${limits.max_options_per_group} options per group.` },
        { status: 403 }
      );
    }
    const [total] = await sql`
      SELECT COUNT(*)::int AS c
      FROM merchant_modifier_options o
      INNER JOIN merchant_modifier_groups g ON g.id = o.modifier_group_id
      WHERE g.store_id = ${storeId}
    `;
    if (Number((total as any)?.c ?? 0) >= limits.max_modifier_options) {
      return NextResponse.json(
        { success: false, error: `LIMIT_MODIFIER_OPTIONS: Maximum ${limits.max_modifier_options} options allowed.` },
        { status: 403 }
      );
    }

    const imageUrl =
      body.image_url != null && String(body.image_url).trim() !== ""
        ? String(body.image_url)
        : null;
    const inStock = typeof body.in_stock === "boolean" ? body.in_stock : true;
    const defaultQuantityRaw = Number(body.default_quantity);
    const defaultQuantity = Number.isFinite(defaultQuantityRaw) ? defaultQuantityRaw : 0;
    const displayOrderRaw = Number(body.display_order);
    const displayOrder = Number.isFinite(displayOrderRaw) ? displayOrderRaw : 0;
    const optionCode = genId("MO_");
    let row: any;
    try {
      [row] = await sql`
        INSERT INTO merchant_modifier_options (modifier_group_id, group_id, option_code, name, price_delta, image_url, in_stock, default_quantity, display_order)
        VALUES (${modifierGroupId}, ${modifierGroupId}, ${optionCode}, ${name}, ${price_delta}, ${imageUrl}, ${inStock}, ${defaultQuantity}, ${displayOrder})        RETURNING id, option_code
      `;
    } catch (insertErr: any) {
      const isGroupIdMissing = insertErr?.code === "42703" && String(insertErr?.message || "").includes("group_id");
      const isGroupIdNull = insertErr?.code === "23502" && String(insertErr?.message || "").includes("group_id");
      if (isGroupIdMissing) {
        [row] = await sql`
          INSERT INTO merchant_modifier_options (modifier_group_id, option_code, name, price_delta, image_url, in_stock, default_quantity, display_order)
          VALUES (${modifierGroupId}, ${optionCode}, ${name}, ${price_delta}, ${imageUrl}, ${inStock}, ${defaultQuantity}, ${displayOrder})          RETURNING id, option_code
        `;
      } else if (isGroupIdNull) {
        [row] = await sql`
          INSERT INTO merchant_modifier_options (group_id, option_code, name, price_delta, image_url, in_stock, default_quantity, display_order)
          VALUES (${modifierGroupId}, ${optionCode}, ${name}, ${price_delta}, ${imageUrl}, ${inStock}, ${defaultQuantity}, ${displayOrder})          RETURNING id, option_code
        `;
      } else throw insertErr;
    }
    const r = row as any;
    return NextResponse.json({ success: true, id: Number(r?.id), option_id: r?.option_code ?? r?.option_id }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/modifier-groups/[groupId]/options]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

