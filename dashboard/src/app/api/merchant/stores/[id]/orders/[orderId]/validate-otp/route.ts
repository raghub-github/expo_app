/**
 * POST /api/merchant/stores/[id]/orders/[orderId]/validate-otp
 * Body: { otp: string }
 * Response: { valid: boolean, error?: string }
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; orderId: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json({ valid: false, error: "Invalid store id" }, { status: 400 });
    }
    const access = await ensureStoreAccess(storeId);
    if ("status" in access) {
      return NextResponse.json({ valid: false, error: access.error }, { status: access.status });
    }
    const body = await request.json().catch(() => ({}));
    const otp = body?.otp;
    // TODO: validate against stored OTP when wired
    return NextResponse.json({ valid: true });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/orders/[orderId]/validate-otp]", e);
    return NextResponse.json({ valid: false, error: "Internal error" }, { status: 500 });
  }
}
