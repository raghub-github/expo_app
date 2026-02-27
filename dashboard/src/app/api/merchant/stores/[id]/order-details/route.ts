/**
 * GET /api/merchant/stores/[id]/order-details?orderId=123
 * Returns { success, items: OrderDetailItem[], riders: OrderDetailRider[] } for ledger expand.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    const { searchParams } = new URL(request.url);
    const orderId = parseInt(searchParams.get("orderId") ?? "", 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(orderId)) {
      return NextResponse.json({ success: false, error: "Invalid store or order id" }, { status: 400 });
    }
    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status });
    }
    // TODO: load order items and rider assignments from DB
    const items: Array<{ id: number; item_name: string; item_title: string | null; quantity: number; unit_price: number; total_price: number; item_type: string | null }> = [];
    const riders: Array<{ id: number; rider_id: number; rider_name: string | null; rider_mobile: string | null; assignment_status: string; assigned_at: string | null; accepted_at: string | null; rejected_at: string | null; reached_merchant_at: string | null; picked_up_at: string | null; delivered_at: string | null; cancelled_at: string | null }> = [];
    return NextResponse.json({ success: true, items, riders });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/order-details]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
