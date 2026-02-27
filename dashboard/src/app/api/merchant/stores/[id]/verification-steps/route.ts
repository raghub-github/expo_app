/**
 * GET /api/merchant/stores/[id]/verification-steps
 * POST /api/merchant/stores/[id]/verification-steps (body: { step: number, notes?: string })
 * Step-by-step verification for the 7 onboarding steps (step 6 Preview and step 7 Agreement removed).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import {
  getStoreVerificationSteps,
  getStoreVerificationStepEdits,
  upsertStoreVerificationStep,
  deleteStoreVerificationStep,
} from "@/lib/db/operations/store-verification-steps";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

async function allowStoreAccess(storeId: number) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
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
    user: { id: user.id, email: user.email },
    systemUserId: systemUser?.id ?? null,
    systemUserName: systemUser?.name ?? user.email,
    store,
    areaManagerId,
  };
}

export async function GET(
  _request: NextRequest,
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
    const steps = await getStoreVerificationSteps(storeId);
    let edits: Awaited<ReturnType<typeof getStoreVerificationStepEdits>> = [];
    try {
      edits = await getStoreVerificationStepEdits(storeId);
    } catch (editsErr) {
      console.warn("[GET verification-steps] edits table may not exist:", editsErr);
    }
    const byStep: Record<
      number,
      { verified_at: string | null; verified_by: number | null; verified_by_name: string | null; notes: string | null }
    > = {};
    for (let i = 1; i <= 7; i++) {
      const s = steps.find((x) => x.step_number === i);
      byStep[i] = s
        ? { verified_at: s.verified_at, verified_by: s.verified_by, verified_by_name: s.verified_by_name, notes: s.notes }
        : { verified_at: null, verified_by: null, verified_by_name: null, notes: null };
    }
    const editsByStep: Record<number, Array<{ field_key: string; old_value: string | null; new_value: string | null; edited_by: number | null; edited_by_name: string | null; edited_at: string }>> = {};
    for (let i = 1; i <= 7; i++) editsByStep[i] = [];
    for (const e of edits) {
      if (editsByStep[e.step_number]) editsByStep[e.step_number].push({ field_key: e.field_key, old_value: e.old_value, new_value: e.new_value, edited_by: e.edited_by, edited_by_name: e.edited_by_name, edited_at: e.edited_at });
    }
    return NextResponse.json({ success: true, steps: byStep, edits: editsByStep });
  } catch (e) {
    console.error("[GET /api/merchant/stores/[id]/verification-steps]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
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
    if (step == null || step < 1 || step > 7) {
      return NextResponse.json(
        { success: false, error: "Invalid step (required: 1–7)" },
        { status: 400 }
      );
    }
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
    const verifiedByName =
      typeof access.systemUserName === "string" ? access.systemUserName : access.user?.email ?? "agent";
    const ok = await upsertStoreVerificationStep({
      storeId,
      stepNumber: step,
      verifiedBy: access.systemUserId ?? null,
      verifiedByName,
      notes,
    });
    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to save verification step. Ensure the store_verification_steps table exists (run migrations).",
        },
        { status: 500 }
      );
    }
    // When menu step (3) is verified, mark all MENU_REFERENCE media files as VERIFIED
    if (step === 3 && access.user?.id) {
      try {
        const sql = getSql();
        await sql`
          UPDATE merchant_store_media_files
          SET verification_status = 'VERIFIED',
              verified_at = now(),
              verified_by = ${access.user.id},
              updated_at = now()
          WHERE store_id = ${storeId}
            AND media_scope = 'MENU_REFERENCE'
            AND is_active = true
            AND deleted_at IS NULL
        `;
      } catch (mediaErr) {
        console.warn("[POST verification-steps] failed to update menu media verification_status:", mediaErr);
      }
    }
    // Once any step (1–7) is verified, move store into UNDER_VERIFICATION
    const currentStatus = (access.store.approval_status || "").toUpperCase();
    if (
      step >= 1 &&
      step <= 7 &&
      currentStatus !== "UNDER_VERIFICATION" &&
      currentStatus !== "APPROVED" &&
      currentStatus !== "REJECTED"
    ) {
      try {
        await updateMerchantStore(
          storeId,
          access.areaManagerId ?? null,
          { approval_status: "UNDER_VERIFICATION" } as Parameters<typeof updateMerchantStore>[2]
        );
      } catch (statusErr) {
        console.warn(
          "[POST verification-steps] failed to bump store to UNDER_VERIFICATION",
          statusErr
        );
      }
    }
    const steps = await getStoreVerificationSteps(storeId);
    let edits: Awaited<ReturnType<typeof getStoreVerificationStepEdits>> = [];
    try {
      edits = await getStoreVerificationStepEdits(storeId);
    } catch (editsErr) {
      console.warn("[POST verification-steps] edits table may not exist:", editsErr);
    }
    const byStep: Record<
      number,
      { verified_at: string | null; verified_by: number | null; verified_by_name: string | null; notes: string | null }
    > = {};
    for (let i = 1; i <= 7; i++) {
      const s = steps.find((x) => x.step_number === i);
      byStep[i] = s
        ? { verified_at: s.verified_at, verified_by: s.verified_by, verified_by_name: s.verified_by_name, notes: s.notes }
        : { verified_at: null, verified_by: null, verified_by_name: null, notes: null };
    }
    const editsByStep: Record<number, Array<{ field_key: string; old_value: string | null; new_value: string | null; edited_by: number | null; edited_by_name: string | null; edited_at: string }>> = {};
    for (let i = 1; i <= 7; i++) editsByStep[i] = [];
    for (const e of edits) {
      if (editsByStep[e.step_number]) editsByStep[e.step_number].push({ field_key: e.field_key, old_value: e.old_value, new_value: e.new_value, edited_by: e.edited_by, edited_by_name: e.edited_by_name, edited_at: e.edited_at });
    }
    return NextResponse.json({ success: true, steps: byStep, edits: editsByStep });
  } catch (e) {
    const err = e instanceof Error ? e.message : "Internal error";
    console.error("[POST /api/merchant/stores/[id]/verification-steps]", e);
    return NextResponse.json(
      { success: false, error: err },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/merchant/stores/[id]/verification-steps
 * Body: { step: number }. Sets that step back to pending (un-verify).
 */
export async function DELETE(
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
    if (step == null || step < 1 || step > 7) {
      return NextResponse.json(
        { success: false, error: "Invalid step (required: 1–7)" },
        { status: 400 }
      );
    }
    const ok = await deleteStoreVerificationStep(storeId, step);
    if (!ok) {
      return NextResponse.json(
        { success: false, error: "Failed to set step to pending" },
        { status: 500 }
      );
    }
    const steps = await getStoreVerificationSteps(storeId);
    let edits: Awaited<ReturnType<typeof getStoreVerificationStepEdits>> = [];
    try {
      edits = await getStoreVerificationStepEdits(storeId);
    } catch (editsErr) {
      console.warn("[DELETE verification-steps] edits table may not exist:", editsErr);
    }
    const byStep: Record<
      number,
      { verified_at: string | null; verified_by: number | null; verified_by_name: string | null; notes: string | null }
    > = {};
    for (let i = 1; i <= 7; i++) {
      const s = steps.find((x) => x.step_number === i);
      byStep[i] = s
        ? { verified_at: s.verified_at, verified_by: s.verified_by, verified_by_name: s.verified_by_name, notes: s.notes }
        : { verified_at: null, verified_by: null, verified_by_name: null, notes: null };
    }
    const editsByStep: Record<number, Array<{ field_key: string; old_value: string | null; new_value: string | null; edited_by: number | null; edited_by_name: string | null; edited_at: string }>> = {};
    for (let i = 1; i <= 7; i++) editsByStep[i] = [];
    for (const e of edits) {
      if (editsByStep[e.step_number]) editsByStep[e.step_number].push({ field_key: e.field_key, old_value: e.old_value, new_value: e.new_value, edited_by: e.edited_by, edited_by_name: e.edited_by_name, edited_at: e.edited_at });
    }
    return NextResponse.json({ success: true, steps: byStep, edits: editsByStep });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/verification-steps]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
