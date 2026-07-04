import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  resolveNotificationStoreId,
  resolveNotificationUserId,
} from "@/lib/notifications/resolve-target";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const storeId = req.nextUrl.searchParams.get("store_id")?.trim() ?? "";
  const userId = req.nextUrl.searchParams.get("user_id")?.trim() ?? "";

  if (!storeId && !userId) {
    return NextResponse.json({ error: "store_id_or_user_id_required" }, { status: 400 });
  }
  if (storeId && userId) {
    return NextResponse.json({ error: "provide_store_id_or_user_id_not_both" }, { status: 400 });
  }

  try {
    if (storeId) {
      const resolved = await resolveNotificationStoreId(storeId);
      if (!resolved) {
        return NextResponse.json({ found: false, error: "store_not_found" }, { status: 404 });
      }
      return NextResponse.json({ found: true, resolved });
    }

    const resolved = await resolveNotificationUserId(userId);
    if (!resolved) {
      return NextResponse.json({ found: false, error: "user_not_found" }, { status: 404 });
    }
    return NextResponse.json({ found: true, resolved });
  } catch (err) {
    console.error("[GET /api/super-admin/notifications/resolve-target]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "lookup_failed" },
      { status: 500 },
    );
  }
}
