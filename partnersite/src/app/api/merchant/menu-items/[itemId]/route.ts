/**
 * GET /api/merchant/menu-items/[itemId]?storeId=XXX
 * Single menu item with images (for photo sheet / edit).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const storeId = req.nextUrl.searchParams.get("storeId");
  const access = await assertStoreAccess(storeId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const menuItemId = parseInt((await params).itemId, 10);
  if (!Number.isFinite(menuItemId)) {
    return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
  }

  const { data: item, error } = await supabase
    .from("merchant_menu_items")
    .select(
      "id, item_id, item_name, item_description, item_image_url, approval_status, rejection_reason, category_id, food_type, spice_level, cuisine_type, base_price, selling_price, in_stock, is_active",
    )
    .eq("id", menuItemId)
    .eq("store_id", access.storeIdNum)
    .single();

  if (error || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const { data: images } = await supabase
    .from("merchant_menu_item_images")
    .select("id, image_url, is_primary, display_order, moderation_status, rejection_reason, moderated_at, created_at")
    .eq("menu_item_id", menuItemId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  return NextResponse.json({
    ...item,
    images: images ?? [],
  });
}
