/**
 * GET /api/merchant/stores/[id]/self-delivery-riders
 * Returns self-delivery riders for the store (from merchant_store_self_delivery_riders).
 * Query: ?active_only=true to return only is_active = true (default: true).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

async function getAreaManagerId(userId: string, email: string) {
  if (await isSuperAdmin(userId, email)) return null;
  const systemUser = await getSystemUserByEmail(email);
  if (!systemUser) return null;
  const am = await getAreaManagerByUserId(systemUser.id);
  return am?.id ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ success: false, error: "Invalid store id" }, { status: 400 });
    }
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }
    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Merchant dashboard access required" }, { status: 403 });
    }
    const areaManagerId = await getAreaManagerId(user.id, user.email);
    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json({ success: false, error: "Store not found" }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("active_only") !== "false";

    const sql = getSql();
    const rows = activeOnly
      ? await sql`
          SELECT id, store_id, rider_name, rider_mobile, rider_email, vehicle_number, is_primary, is_active, created_at, updated_at
          FROM merchant_store_self_delivery_riders
          WHERE store_id = ${storeId} AND is_active = true
          ORDER BY is_primary DESC NULLS LAST, rider_name ASC
        `
      : await sql`
          SELECT id, store_id, rider_name, rider_mobile, rider_email, vehicle_number, is_primary, is_active, created_at, updated_at
          FROM merchant_store_self_delivery_riders
          WHERE store_id = ${storeId}
          ORDER BY is_primary DESC NULLS LAST, rider_name ASC
        `;

    const riders = Array.isArray(rows) ? rows : (rows ? [rows] : []);
    return NextResponse.json({
      success: true,
      riders: riders.map((r: Record<string, unknown>) => ({
        id: r.id,
        store_id: r.store_id,
        rider_name: r.rider_name,
        rider_mobile: r.rider_mobile,
        rider_email: r.rider_email ?? null,
        vehicle_number: r.vehicle_number ?? null,
        is_primary: r.is_primary === true,
        is_active: r.is_active !== false,
        created_at: r.created_at,
        updated_at: r.updated_at,
      })),
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/self-delivery-riders]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
