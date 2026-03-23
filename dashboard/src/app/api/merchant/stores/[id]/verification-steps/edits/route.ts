/**
 * POST /api/merchant/stores/[id]/verification-steps/edits
 * Log a field edit during verification (body: { step: number, field_key: string, old_value?: string | null, new_value?: string | null }).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById } from "@/lib/db/operations/merchant-stores";
import { insertStoreVerificationStepEdit } from "@/lib/db/operations/store-verification-steps";

export const runtime = "nodejs";

async function allowStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user?.email) {
    return { allowed: false as const, status: 401, error: "Not authenticated" };
  }
  const allowed =
    (await isSuperAdmin(user.id, user.email)) ||
    (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
  if (!allowed) {
    return { allowed: false as const, status: 403, error: "Merchant dashboard access required" };
  }
  let areaManagerId: number | null = null;
  if (!(await isSuperAdmin(user.id, user.email))) {
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      const am = await getAreaManagerByUserId(systemUser.id);
      if (am) areaManagerId = am.id;
    }
  }
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) {
    return { allowed: false as const, status: 404, error: "Store not found" };
  }
  const systemUser = await getSystemUserByEmail(user.email);
  return {
    allowed: true as const,
    systemUserId: systemUser?.id ?? null,
    systemUserName: systemUser?.full_name?.trim() || user.email,  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const storeId = parseInt(id, 10);
    if (!Number.isFinite(storeId)) {
      return NextResponse.json(
        { success: false, error: "Invalid store id" },
        { status: 400 }
      );
    }
    const access = await allowStoreAccess(storeId);
    if (!access.allowed) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status }
      );
    }
    const body = await request.json().catch(() => ({}));
    const step = typeof body.step === "number" ? Math.floor(body.step) : undefined;
    const fieldKey = typeof body.field_key === "string" ? body.field_key.trim() : undefined;
    if (step == null || step < 1 || step > 8 || !fieldKey) {
      return NextResponse.json(
        { success: false, error: "Invalid step (1–8) or missing field_key" },
        { status: 400 }
      );
    }
    const oldValue = body.old_value === undefined ? null : (body.old_value == null ? null : String(body.old_value));
    const newValue = body.new_value === undefined ? null : (body.new_value == null ? null : String(body.new_value));
    const editedByName = access.systemUserName.trim() || "agent";
    const ok = await insertStoreVerificationStepEdit({
      storeId,
      stepNumber: step,
      fieldKey,
      oldValue,
      newValue,
      editedBy: access.systemUserId ?? null,
      editedByName,
    });
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Failed to log edit" },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/verification-steps/edits]", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
