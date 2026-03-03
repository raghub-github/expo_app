/**
 * GET /api/merchant/stores/[id]/orders/[orderId]/rider-timeline?rider_id=
 * Returns rider assignment timeline for the order. Response: { assigned_at?, accepted_at?, ... }.
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
  request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    const { searchParams } = new URL(request.url);
    const riderId = searchParams.get("rider_id");
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({});
    }
    const access = await ensureStoreAccess(storeId);
    if ("status" in access) {
      return NextResponse.json({});
    }
    // TODO: load from order_rider_assignments when wired
    return NextResponse.json({
      assigned_at: null,
      accepted_at: null,
      reached_merchant_at: null,
      picked_up_at: null,
      delivered_at: null,
      rejected_at: null,
      cancelled_at: null,
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/orders/[orderId]/rider-timeline]", e);
    return NextResponse.json({});
  }
}
