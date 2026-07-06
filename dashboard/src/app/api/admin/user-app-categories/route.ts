/**
 * GET /api/admin/user-app-categories?storeType=FOOD&includeInactive=1
 * POST /api/admin/user-app-categories — create (super admin)
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/admin/require-super-admin-api";
import {
  listUserAppCategories,
  createUserAppCategory,
  normalizeDisplayOrdersForStore,
} from "@/lib/db/operations/user-app-categories";
import {
  parseUserAppCategoryStoreType,
  parseUserAppCategoryStatus,
  parseUserAppCategoryDisplayOrder,
} from "@/lib/user-app-categories/shared";

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
    const includeInactive =
      request.nextUrl.searchParams.get("includeInactive") === "1" ||
      request.nextUrl.searchParams.get("includeInactive") === "true";
    const items = await listUserAppCategories({ storeType, includeInactive });
    return NextResponse.json({ success: true, items, storeType, includeInactive });
  } catch (e) {
    console.error("[GET /api/admin/user-app-categories]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const store_type_raw = body.store_type;
    const store_type =
      store_type_raw == null || store_type_raw === ""
        ? "FOOD"
        : parseUserAppCategoryStoreType(store_type_raw);
    if (store_type == null) {
      return NextResponse.json({ success: false, error: "Invalid store_type" }, { status: 400 });
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const image_url =
      typeof body.image_url === "string" && body.image_url.trim()
        ? body.image_url.trim()
        : null;
    const statusRaw = body.status;
    const status =
      statusRaw == null || statusRaw === ""
        ? "active"
        : parseUserAppCategoryStatus(statusRaw);
    if (status == null) {
      return NextResponse.json({ success: false, error: "status must be active or inactive" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ success: false, error: "name required" }, { status: 400 });
    }

    let display_order = 0;
    if ("display_order" in body) {
      const parsed = parseUserAppCategoryDisplayOrder(body.display_order);
      if (parsed === null) {
        return NextResponse.json({ success: false, error: "display_order must be an integer" }, { status: 400 });
      }
      display_order = parsed;
    }

    const result = await createUserAppCategory({
      store_type,
      name,
      image_url,
      status,
      display_order,
    });

    if (!result.ok) {
      return NextResponse.json({ success: false, error: "Invalid status" }, { status: 400 });
    }
    await normalizeDisplayOrdersForStore(store_type);
    const items = await listUserAppCategories({ storeType: store_type, includeInactive: true });
    const item = items.find((r) => r.id === result.row.id) ?? result.row;
    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/admin/user-app-categories]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
