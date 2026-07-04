/**
 * GET/PATCH /api/admin/user-app-categories/meta?storeType=FOOD
 * Super admin — manage the fixed "All" tab tile (label + image).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/require-super-admin-api";
import {
  getUserAppCategoryAllTab,
  upsertUserAppCategoryAllTab,
} from "@/lib/db/operations/user-app-category-meta";
import { parseUserAppCategoryStoreType } from "@/lib/user-app-categories/shared";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const rawSt = request.nextUrl.searchParams.get("storeType");
    const storeType =
      rawSt == null || rawSt === "" ? "FOOD" : parseUserAppCategoryStoreType(rawSt);
    if (storeType == null) {
      return NextResponse.json({ success: false, error: "Invalid storeType" }, { status: 400 });
    }
    const allTab = await getUserAppCategoryAllTab(storeType);
    return NextResponse.json({ success: true, storeType, allTab });
  } catch (e) {
    console.error("[GET /api/admin/user-app-categories/meta]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const store_type_raw = body.store_type ?? body.storeType;
    const store_type =
      store_type_raw == null || store_type_raw === ""
        ? "FOOD"
        : parseUserAppCategoryStoreType(store_type_raw);
    if (store_type == null) {
      return NextResponse.json({ success: false, error: "Invalid store_type" }, { status: 400 });
    }
    const label = typeof body.label === "string" ? body.label.trim() : undefined;
    const imageUrl =
      body.image_url === null || body.image_url === ""
        ? null
        : typeof body.image_url === "string"
          ? body.image_url.trim() || null
          : typeof body.imageUrl === "string"
            ? body.imageUrl.trim() || null
            : undefined;
    const allTab = await upsertUserAppCategoryAllTab(store_type, { label, imageUrl });
    return NextResponse.json({ success: true, storeType: store_type, allTab });
  } catch (e) {
    console.error("[PATCH /api/admin/user-app-categories/meta]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
