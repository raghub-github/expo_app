/**
 * GET /api/merchant/menu/category-config?storeId=...
 * Store-type cuisine + item-form profile (aligned with dashboard / backend category-config).
 * Cheap: 1 store row + 1 onboarding-flags row. No plan-count scans.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CUISINE_ENABLED = new Set([
  "FOOD",
  "RESTAURANT",
  "CAFE",
  "BAKERY",
  "CLOUD_KITCHEN",
  "FOOD_TRUCK",
  "ICE_CREAM_PARLOR",
  "GROCERY",
]);

function normalizeStoreType(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("Supabase admin env missing");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  try {
    const storeId = (request.nextUrl.searchParams.get("storeId") || "").trim();
    if (!storeId) {
      return NextResponse.json({ error: "storeId required" }, { status: 400 });
    }

    const db = getAdmin();
    const { data: store, error: storeErr } = await db
      .from("merchant_stores")
      .select("id, store_type")
      .eq("store_id", storeId)
      .maybeSingle();

    if (storeErr || !store?.id) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const storeType = normalizeStoreType(store.store_type as string | null);
    const grocery = storeType === "GROCERY";

    let cuisineEnabled = DEFAULT_CUISINE_ENABLED.has(storeType);
    if (storeType) {
      const { data: flag } = await db
        .from("merchant_store_type_onboarding_flags")
        .select("cuisine_list_enabled")
        .eq("store_type", storeType)
        .maybeSingle();
      if (flag && typeof (flag as { cuisine_list_enabled?: boolean }).cuisine_list_enabled === "boolean") {
        cuisineEnabled = Boolean((flag as { cuisine_list_enabled: boolean }).cuisine_list_enabled);
      }
    }

    return NextResponse.json({
      store_type: storeType || null,
      cuisine_field: {
        visible: cuisineEnabled,
        required_for_root: false,
        inherit_on_subcategory: true,
      },
      allow_create_custom_cuisine: cuisineEnabled,
      item_form: {
        variant: grocery ? "grocery" : "standard",
        show_expiry: grocery,
        show_food_attrs: !grocery,
      },
    });
  } catch (e) {
    console.error("[GET /api/merchant/menu/category-config]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
