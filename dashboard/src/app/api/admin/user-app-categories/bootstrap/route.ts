/**
 * GET /api/admin/user-app-categories/bootstrap?storeType=FOOD
 * Single round-trip for admin categories page (list + All tab meta).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/require-super-admin-api";
import { listUserAppCategories } from "@/lib/db/operations/user-app-categories";
import { getUserAppCategoryAllTab } from "@/lib/db/operations/user-app-category-meta";
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

    const [items, allTab] = await Promise.all([
      listUserAppCategories({ storeType, includeInactive: true }),
      getUserAppCategoryAllTab(storeType),
    ]);

    return NextResponse.json({ success: true, storeType, items, allTab });
  } catch (e) {
    console.error("[GET /api/admin/user-app-categories/bootstrap]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
