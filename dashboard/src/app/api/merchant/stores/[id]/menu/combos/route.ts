/**
 * Combos for store menu. GET/POST /api/merchant/stores/[id]/menu/combos
 */
import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db/client";
import { assertStoreAccess } from "../assert-store-access";
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
    const combos = await sql`
      SELECT id, combo_name, description, combo_price::text, image_url, is_active, is_deleted, display_order
      FROM merchant_menu_combos
      WHERE store_id = ${storeId} AND (is_deleted IS NULL OR is_deleted = false)
      ORDER BY display_order ASC, id ASC
    `;
    return NextResponse.json({ success: true, combos });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu/combos]", e);
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
    const combo_name = String(body.combo_name ?? "").trim();
    if (!combo_name) return NextResponse.json({ success: false, error: "combo_name required" }, { status: 400 });
    const combo_price = Number(body.combo_price);
    if (!Number.isFinite(combo_price) || combo_price < 0) {
      return NextResponse.json({ success: false, error: "Valid combo_price required" }, { status: 400 });
    }

    const description =
      body.description != null && String(body.description).trim() !== ""
        ? String(body.description)
        : null;
    const imageUrl =
      body.image_url != null && String(body.image_url).trim() !== ""
        ? String(body.image_url)
        : null;
    const displayOrderRaw = Number(body.display_order);
    const displayOrder = Number.isFinite(displayOrderRaw) ? displayOrderRaw : 0;
    const sql = getSql();
    const [row] = await sql`
      INSERT INTO merchant_menu_combos (store_id, combo_name, description, combo_price, image_url, display_order)
      VALUES (${storeId}, ${combo_name}, ${description}, ${combo_price}, ${imageUrl}, ${displayOrder})      RETURNING id
    `;
    try {
      const agentId = await getAgentIdForStore(storeId);
      await insertActivityLog({
        storeId,
        agentId,
        changedSection: "menu_combos",
        fieldName: "combo",
        oldValue: null,
        newValue: JSON.stringify({ combo_name, description, combo_price }),
        actionType: "create",
      });
    } catch (_logErr) {}
    try {
      await logStoreActivity({ storeId, section: "combo", action: "create", entityName: combo_name, summary: `Agent created combo "${combo_name}"`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    return NextResponse.json({ success: true, id: Number((row as any)?.id) }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/combos]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
