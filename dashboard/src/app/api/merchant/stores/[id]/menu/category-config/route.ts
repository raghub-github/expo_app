/**
 * GET /api/merchant/stores/[id]/menu/category-config
 * Store-type + plan limits for category/cuisine UI (aligned with merchant backend).
 */
import { NextResponse } from "next/server";
import { assertStoreAccess } from "../assert-store-access";
import {
  buildCategoryUiConfig,
  resolveStoreTypeForMenu,
} from "@/lib/db/operations/menu-category-rules";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const storeType = await resolveStoreTypeForMenu(storeId);
    const config = await buildCategoryUiConfig(storeId, storeType);
    return NextResponse.json(config);
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/menu/category-config]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
