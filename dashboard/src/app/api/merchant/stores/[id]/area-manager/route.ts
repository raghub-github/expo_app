/**
 * GET /api/merchant/stores/[id]/area-manager
 * Returns area manager assigned to this store (id, name, email, mobile).
 */
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { getSql } from "@/lib/db/client";

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
    const store = access.store as { area_manager_id?: number | null };
    const amId = store.area_manager_id;
    if (amId == null) {
      return NextResponse.json({ success: true, areaManager: null });
    }
    const sql = getSql();
    const rows = await sql`
      SELECT am.id, su.full_name, su.email, su.mobile
      FROM area_managers am
      JOIN system_users su ON su.id = am.user_id
      WHERE am.id = ${amId}
      LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) {
      return NextResponse.json({ success: true, areaManager: null });
    }
    const r = row as { id: number; full_name: string | null; email: string | null; mobile: string | null };
    return NextResponse.json({
      success: true,
      areaManager: {
        id: r.id,
        name: r.full_name ?? "—",
        email: r.email ?? "—",
        mobile: r.mobile ?? "—",
      },
    });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/area-manager]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}
