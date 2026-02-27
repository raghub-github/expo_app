/**
 * PATCH /api/merchant/stores/[id]/orders/[orderId]
 * Body: { status: string, rejected_reason?: string }
 * Updates order status. Returns { order: OrdersFoodRow }.
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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id, orderId } = await params;
    const storeId = parseInt(id, 10);
    const orderIdNum = parseInt(orderId, 10);
    if (!Number.isFinite(storeId) || !Number.isFinite(orderIdNum)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const access = await ensureStoreAccess(storeId);
    if ("status" in access) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const body = await request.json().catch(() => ({}));
    const status = body?.status;
    if (!status || typeof status !== "string") {
      return NextResponse.json({ error: "status required" }, { status: 400 });
    }
    // TODO: update orders_food in DB and return updated row
    const order = {
      id: orderIdNum,
      order_id: orderIdNum,
      order_status: status,
      created_at: new Date().toISOString(),
      rejected_reason: body.rejected_reason ?? null,
    };
    return NextResponse.json({ order });
  } catch (e) {
    console.error("[PATCH /api/merchant/stores/[id]/orders/[orderId]]", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
