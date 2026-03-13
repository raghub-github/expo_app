/**
 * Items CRUD for dashboard store menu.
 * POST /api/merchant/stores/[id]/menu/items
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { ulid } from "ulid";

export const runtime = "nodejs";

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

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
    }

    let areaManagerId: number | null = null;
    if (!(await isSuperAdmin(user.id, user.email))) {
      const systemUser = await getSystemUserByEmail(user.email);
      if (systemUser) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const item_name = String(body.item_name ?? "").trim();
    if (!item_name) return NextResponse.json({ success: false, error: "item_name required" }, { status: 400 });

    const category_id = body.category_id != null ? Number(body.category_id) : null;
    if (!category_id || !Number.isFinite(category_id)) {
      return NextResponse.json({ success: false, error: "category_id required" }, { status: 400 });
    }

    const base_price = Number(body.base_price ?? 0);
    const selling_price = Number(body.selling_price ?? base_price);
    if (!Number.isFinite(base_price) || base_price < 0 || !Number.isFinite(selling_price) || selling_price < 0) {
      return NextResponse.json({ success: false, error: "Invalid price" }, { status: 400 });
    }

    const itemId = ulid();
    const sql = getSql();
    const [row] = await sql`
      INSERT INTO merchant_menu_items (
        store_id, category_id, item_id, item_name, item_description, food_type, spice_level, cuisine_type,
        base_price, selling_price, preparation_time_minutes, serves, serves_label, short_name, display_order,
        item_size_value, item_size_unit, available_for_delivery,
        in_stock, is_active,
        has_customizations, has_addons, has_variants,
        approval_status, approved_at, approved_by,
        created_at, updated_at
      )
      VALUES (
        ${storeId}, ${category_id}, ${itemId}, ${item_name}, ${body.item_description ?? null},
        ${body.food_type ?? null}, ${body.spice_level ?? null}, ${body.cuisine_type ?? null},
        ${base_price}, ${selling_price},
        ${body.preparation_time_minutes ?? null},
        ${body.serves ?? null},
        ${body.serves_label ?? null},
        ${body.short_name ?? null},
        ${body.display_order ?? 0},
        ${body.item_size_value ?? null},
        ${body.item_size_unit ?? null},
        ${body.available_for_delivery ?? true},
        ${body.in_stock ?? true},
        ${body.is_active ?? true},
        ${body.has_customizations ?? false},
        ${body.has_addons ?? false},
        ${body.has_variants ?? false},
        'PENDING'::merchant_menu_item_approval_status,
        NULL,
        NULL,
        NOW(),
        NOW()
      )
      RETURNING id, item_id
    `;

    return NextResponse.json({ success: true, id: Number((row as any).id), item_id: (row as any).item_id }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/items]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

