/**
 * Modifier groups (reusable addon library) for dashboard store menu.
 * GET/POST /api/merchant/stores/[id]/menu/modifier-groups
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { bodyBool, bodyNum, bodyOptionalStr } from "@/lib/db/sql-json-body";
import { assertStoreAccess, genId, getModifierLimits } from "../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const sql = getSql();
    const groups = (await sql`
      SELECT g.id, g.group_code, g.title, g.description, g.is_required, g.min_selection, g.max_selection, g.display_order
      FROM merchant_modifier_groups g
      WHERE g.store_id = ${storeId}
      ORDER BY g.display_order ASC, g.id ASC
    `) as any[];

    const result: any[] = [];
    for (const g of groups) {
      const [optCount] = await sql`SELECT COUNT(*)::int AS c FROM merchant_modifier_options WHERE modifier_group_id = ${g.id}`;
      const [useCount] = await sql`SELECT COUNT(*)::int AS c FROM merchant_item_modifier_groups WHERE modifier_group_id = ${g.id}`;
      const code = (g as any).group_code ?? (g as any).group_id;
      result.push({
        ...g,
        group_id: code,
        options_count: Number((optCount as any)?.c ?? 0),
        used_in_items_count: Number((useCount as any)?.c ?? 0),
      });
    }

    return NextResponse.json({ success: true, modifierGroups: result });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu/modifier-groups]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) return NextResponse.json({ success: false, error: access.error }, { status: access.status });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const title = String(body.title ?? "").trim();
    if (!title) return NextResponse.json({ success: false, error: "title required" }, { status: 400 });

    const sql = getSql();
    const limits = await getModifierLimits(storeId);
    const [countRow] = await sql`SELECT COUNT(*)::int AS c FROM merchant_modifier_groups WHERE store_id = ${storeId}`;
    if (Number((countRow as any)?.c ?? 0) >= limits.max_modifier_groups) {
      return NextResponse.json(
        { success: false, error: `LIMIT_MODIFIER_GROUPS: Maximum ${limits.max_modifier_groups} addon groups allowed.` },
        { status: 403 }
      );
    }

    const description =
      body.description != null && String(body.description).trim() !== ""
        ? String(body.description)
        : null;
    const isRequired = typeof body.is_required === "boolean" ? body.is_required : false;
    const minSelRaw = Number(body.min_selection);
    const minSelection = Number.isFinite(minSelRaw) ? minSelRaw : 0;
    const maxSelRaw = Number(body.max_selection);
    const maxSelection = Number.isFinite(maxSelRaw) && maxSelRaw >= 1 ? maxSelRaw : 1;
    const displayOrderRaw = Number(body.display_order);
    const displayOrder = Number.isFinite(displayOrderRaw) ? displayOrderRaw : 0;
    const groupCode = genId("MG_");
    const [row] = await sql`
      INSERT INTO merchant_modifier_groups (store_id, group_code, title, description, is_required, min_selection, max_selection, display_order)
      VALUES (${storeId}, ${groupCode}, ${title}, ${description}, ${isRequired}, ${minSelection}, ${maxSelection}, ${displayOrder})      RETURNING id, group_code
    `;
    const r = row as any;
    try {
      await logStoreActivity({ storeId, section: "addon", action: "create", summary: `Agent created modifier group`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, id: Number(r?.id), group_id: r?.group_code ?? r?.group_id }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/modifier-groups]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

