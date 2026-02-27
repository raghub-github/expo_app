/**
 * GET /api/merchant/stores/[id]/orders/[orderId]/riders-log
 * Returns list of riders assigned to this order. Response: { riders: Array<...> }.
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";

export const runtime = "nodejs";

async function ensureStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) return { error: "Not authenticated", status: 401 as const };
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) return { error: "Forbidden", status: 403 as const };
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) return { error: "Store not found", status: 404 as const };
  return { store };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ riders: [] });
    }
    const access = await ensureStoreAccess(storeId);
    if ("status" in access) {
      return NextResponse.json({ riders: [] });
    }
    // TODO: load from order_rider_assignments when wired
    return NextResponse.json({ riders: [] });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/orders/[orderId]/riders-log]", e);
    return NextResponse.json({ riders: [] });
  }
}
