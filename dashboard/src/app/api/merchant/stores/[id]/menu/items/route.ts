/**
 * Items CRUD for dashboard store menu.
 * POST /api/merchant/stores/[id]/menu/items
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";
import { ulid } from "ulid";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";

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
    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json({ success: false, error: "Merchant access required" }, { status: 403 });
    }
    if (!access.can_update_menu) {
      return NextResponse.json({ success: false, error: "Menu update permission required" }, { status: 403 });
    }

    let areaManagerId: number | null = null;
    if (!access.isSuperAdmin) {
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

    const strOrNull = (v: unknown) =>
      v != null && String(v).trim() !== "" ? String(v) : null;
    const numOrNull = (v: unknown) => {
      if (v == null || v === "") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const boolOr = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
    const numOr = (v: unknown, def: number) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : def;
    };

    const itemDescription = strOrNull(body.item_description);
    const foodType = strOrNull(body.food_type);
    const spiceLevel = strOrNull(body.spice_level);
    const cuisineType = strOrNull(body.cuisine_type);
    const preparationTimeMinutes = numOrNull(body.preparation_time_minutes);
    const serves = numOrNull(body.serves);
    const servesLabel = strOrNull(body.serves_label);
    const shortName = strOrNull(body.short_name);
    const displayOrder = numOr(body.display_order, 0);
    const itemSizeValue = numOrNull(body.item_size_value);
    const itemSizeUnit = strOrNull(body.item_size_unit);
    const availableForDelivery = boolOr(body.available_for_delivery, true);
    const inStock = boolOr(body.in_stock, true);
    const isActive = boolOr(body.is_active, true);
    const hasCustomizations = boolOr(body.has_customizations, false);
    const hasAddons = boolOr(body.has_addons, false);
    const hasVariants = boolOr(body.has_variants, false);

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
        ${storeId}, ${category_id}, ${itemId}, ${item_name}, ${itemDescription},
        ${foodType}, ${spiceLevel}, ${cuisineType},
        ${base_price}, ${selling_price},
        ${preparationTimeMinutes},
        ${serves},
        ${servesLabel},
        ${shortName},
        ${displayOrder},
        ${itemSizeValue},
        ${itemSizeUnit},
        ${availableForDelivery},
        ${inStock},
        ${isActive},
        ${hasCustomizations},
        ${hasAddons},
        ${hasVariants},
        'PENDING'::merchant_menu_item_approval_status,
        NULL,
        NULL,
        NOW(),
        NOW()
      )
      RETURNING id, item_id
    `;

    const newId = Number((row as any).id);
    try {
      await logStoreActivity({ storeId, section: "menu_item", action: "create", entityId: newId, entityName: item_name, summary: `Agent created menu item "${item_name}"`, actorType: "agent", source: "dashboard" });
    } catch (_) {}
    try {
      await logActionByAuth(user.id, user.email, "MERCHANT", "CREATE", {
        resourceType: "MENU_ITEM",
        resourceId: String(newId),
        actionDetails: { storeId, item_name, item_id: (row as any).item_id },
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
      });
    } catch (_) {}

    return NextResponse.json({ success: true, id: newId, item_id: (row as any).item_id }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/menu/items]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

