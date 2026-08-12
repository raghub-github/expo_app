/**
 * GET /api/merchant/stores/[id]/order-line-item-menu?menuItemId=123
 * Live menu row for order-history / order-details item modal (merchant_menu_items).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    const menuItemIdRaw = request.nextUrl.searchParams.get("menuItemId");
    const menuItemId =
      menuItemIdRaw != null ? parseInt(menuItemIdRaw, 10) : NaN;

    if (!Number.isFinite(storeId) || !Number.isFinite(menuItemId)) {
      return NextResponse.json(
        { success: false, error: "store id and menuItemId are required" },
        { status: 400 },
      );
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 },
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 },
      );
    }

    const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });

    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 },
      );
    }

    if (!supabaseAdmin) {
      return NextResponse.json(
        { success: false, error: "Server misconfigured" },
        { status: 500 },
      );
    }

    const { data: item, error } = await supabaseAdmin
      .from("merchant_menu_items")
      .select(
        "id, item_id, item_name, item_description, item_image_url, food_type, in_stock, selling_price, base_price, category_id, preparation_time_minutes, serves, spice_level",
      )
      .eq("id", menuItemId)
      .eq("store_id", storeId)
      .maybeSingle();

    if (error) {
      console.error("[order-line-item-menu]", error.message);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 },
      );
    }
    if (!item) {
      return NextResponse.json(
        { success: false, error: "Item not found" },
        { status: 404 },
      );
    }

    let categoryName: string | null = null;
    if (item.category_id != null) {
      const { data: cat } = await supabaseAdmin
        .from("merchant_menu_categories")
        .select("category_name")
        .eq("id", item.category_id)
        .maybeSingle();
      categoryName =
        (cat as { category_name?: string } | null)?.category_name ?? null;
    }

    return NextResponse.json({
      success: true,
      item: {
        id: item.id,
        item_id: item.item_id,
        item_name: item.item_name,
        item_description: item.item_description,
        item_image_url: item.item_image_url,
        food_type: item.food_type,
        in_stock: item.in_stock,
        selling_price:
          item.selling_price != null ? Number(item.selling_price) : null,
        base_price: item.base_price != null ? Number(item.base_price) : null,
        category_name: categoryName,
        preparation_time_minutes: item.preparation_time_minutes,
        serves: item.serves,
        spice_level: item.spice_level,
      },
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/order-line-item-menu]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
