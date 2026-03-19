/**
 * GET /api/merchant/stores/[id]/activity-feed?limit=50&section=offer
 * Returns unified activity feed for the store.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getStoreActivityFeed } from "@/lib/db/operations/store-activity-feed";

export const runtime = "nodejs";

async function assertStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { ok: false as const, status: 401, error: "Not authenticated" };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { ok: false as const, status: 403, error: "Forbidden" };
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { ok: false as const, status: 404, error: "Store not found" };
  return { ok: true as const, store };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    const store = access.store as { id: number };
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit")) || 50, 200);
    const section = request.nextUrl.searchParams.get("section") || undefined;
    const source = request.nextUrl.searchParams.get("source") || undefined;
    const actorType = request.nextUrl.searchParams.get("actor_type") || undefined;
    const action = request.nextUrl.searchParams.get("action") || undefined;
    const activities = await getStoreActivityFeed(store.id, { limit, section, source, actorType, action });
    return NextResponse.json({ success: true, activities });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/activity-feed]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
