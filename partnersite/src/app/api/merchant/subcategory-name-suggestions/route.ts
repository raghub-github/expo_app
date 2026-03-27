import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { client as sql } from "@/lib/drizzle";
import { suggestPeerSubcategoryNamesForStore } from "@/lib/menu-category-suggestions";

/**
 * GET /api/merchant/subcategory-name-suggestions?storeId=&q=&limit=&parentCategoryId=&editingCategoryId=
 */
export async function GET(req: NextRequest) {
  try {
    const supabaseServer = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabaseServer.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });
    if (!validation.isValid) {
      return NextResponse.json(
        { error: validation.error ?? "Merchant not found" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get("storeId");
    if (!storeId) {
      return NextResponse.json({ error: "storeId required" }, { status: 400 });
    }

    const parentRaw = searchParams.get("parentCategoryId");
    const parentParsed =
      parentRaw != null && parentRaw.trim() !== "" ? parseInt(String(parentRaw), 10) : NaN;
    if (!Number.isFinite(parentParsed) || parentParsed <= 0) {
      return NextResponse.json({ error: "parentCategoryId required" }, { status: 400 });
    }

    const storeRows = await sql<{ id: number; parent_id: number }[]>`
      SELECT id, parent_id FROM merchant_stores
      WHERE store_id = ${String(storeId).trim()} AND deleted_at IS NULL
      LIMIT 1
    `;
    const store = storeRows[0] ?? null;

    if (!store?.id || !store?.parent_id) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    if (store.parent_id !== validation.merchantParentId) {
      return NextResponse.json({ error: "Store does not belong to this merchant" }, { status: 403 });
    }

    const q = searchParams.get("q") ?? "";
    const limitRaw = searchParams.get("limit");
    const limitParsed = limitRaw != null ? parseInt(String(limitRaw), 10) : 12;
    const limit = Number.isFinite(limitParsed) ? limitParsed : 12;
    const editRaw = searchParams.get("editingCategoryId");
    const editingParsed =
      editRaw != null && editRaw !== "" ? parseInt(String(editRaw), 10) : NaN;
    const editingCategoryId = Number.isFinite(editingParsed) ? editingParsed : null;

    const suggestions = await suggestPeerSubcategoryNamesForStore(sql, Number(store.id), {
      q,
      limit,
      parentCategoryId: parentParsed,
      editingCategoryId,
    });

    return NextResponse.json({ suggestions });
  } catch (e) {
    console.error("[subcategory-name-suggestions]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
