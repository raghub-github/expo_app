/**
 * DELETE /api/merchant/stores/[id]/menu/cuisines/[cuisineId]
 * Unlink a cuisine from the store (fails if a category still uses it).
 */
import { NextRequest, NextResponse } from "next/server";
import { assertStoreAccess } from "../../assert-store-access";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import { unlinkCuisineFromStore, CategoryRuleError } from "@/lib/db/operations/menu-category-rules";

export const runtime = "nodejs";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; cuisineId: string }> }
) {
  try {
    const { id, cuisineId: cuisineIdStr } = await params;
    const storeId = parseInt(id, 10);
    const cuisineId = parseInt(cuisineIdStr, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(cuisineId)) {
      return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    try {
      await unlinkCuisineFromStore(storeId, cuisineId);
      try {
        await logStoreActivity({
          storeId,
          section: "category",
          action: "delete",
          entityId: cuisineId,
          summary: `Unlinked cuisine #${cuisineId} from store`,
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
    console.error("[DELETE .../menu/cuisines/[cuisineId]]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
