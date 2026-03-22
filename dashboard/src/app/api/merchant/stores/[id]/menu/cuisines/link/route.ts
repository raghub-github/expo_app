/**
 * POST /api/merchant/stores/[id]/menu/cuisines/link
 * Link an existing cuisine_master row to this store (from global catalog).
 */
import { NextRequest, NextResponse } from "next/server";
import { assertStoreAccess } from "../../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import { linkExistingCuisineToStore, CategoryRuleError } from "@/lib/db/operations/menu-category-rules";

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
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    const body = (await request.json().catch(() => ({}))) as { cuisine_id?: unknown };
    const cuisine_id = body.cuisine_id != null ? Number(body.cuisine_id) : NaN;
    if (!Number.isFinite(cuisine_id) || cuisine_id <= 0) {
      return NextResponse.json({ success: false, error: "cuisine_id required" }, { status: 400 });
    }
    try {
      await linkExistingCuisineToStore(storeId, cuisine_id);
      try {
        await logStoreActivity({
          storeId,
          section: "category",
          action: "update",
          entityId: cuisine_id,
          summary: `Linked cuisine #${cuisine_id} to store`,
          actorType: "agent",
          source: "dashboard",
        });
      } catch (_) {}
      return NextResponse.json({ success: true });
    } catch (e) {
      if (e instanceof CategoryRuleError) {
        return NextResponse.json({ error: e.code, message: e.message }, { status: e.httpStatus });
      }
      throw e;
    }
  } catch (e) {
    console.error("[POST .../menu/cuisines/link]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
