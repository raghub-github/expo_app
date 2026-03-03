/**
 * POST /api/merchant/stores/[id]/verify
 * Approve or reject a store (MERCHANT dashboard: agents / area managers / super admin).
 * Sends the provided message to the store owner's registered email.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import { logAreaManagerActivity } from "@/lib/area-manager/activity";
import { logActionByAuth } from "@/lib/audit/logger";
import { getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { sendEmail } from "@/lib/email/send";

export const runtime = "nodejs";

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

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: sessionError,
    } = await supabase.auth.getUser();

    if (sessionError || !user?.email) {
      return NextResponse.json(
        { success: false, error: "Not authenticated", code: "SESSION_REQUIRED" },
        { status: 401 }
      );
    }

    const allowed =
      (await isSuperAdmin(user.id, user.email)) ||
      (await hasDashboardAccessByAuth(user.id, user.email, "MERCHANT"));
    if (!allowed) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchant dashboard access required",
          code: "MERCHANT_ACCESS_REQUIRED",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action === "reject" ? "reject" : "approve";
    const reason = typeof body.reason === "string" ? body.reason.trim() : undefined;
    const messageToOwner =
      typeof body.message === "string"
        ? body.message.trim()
        : reason ?? (action === "approve" ? "Your store has been approved by the GatiMitra team." : "Your store verification decision has been updated.");

    let areaManagerId: number | null = null;
    let systemUserId: number | null = null;
    const systemUser = await getSystemUserByEmail(user.email);
    if (systemUser) {
      systemUserId = systemUser.id;
      if (!(await isSuperAdmin(user.id, user.email))) {
        const am = await getAreaManagerByUserId(systemUser.id);
        if (am) areaManagerId = am.id;
      }
    }

    const store = await getMerchantStoreById(storeId, areaManagerId);
    if (!store) {
      return NextResponse.json(
        { success: false, error: "Store not found" },
        { status: 404 }
      );
    }

    const currentStatus = ((store.approval_status as unknown as string) || "").toUpperCase();
    if (currentStatus === "APPROVED" || currentStatus === "DELISTED") {
      return NextResponse.json(
        {
          success: false,
          error:
            currentStatus === "DELISTED"
              ? "Delisted stores cannot be re-verified."
              : "Store is already verified and cannot be verified again.",
          code: "STORE_ALREADY_VERIFIED",
        },
        { status: 400 }
      );
    }

    const approval_status = action === "approve" ? "APPROVED" : "REJECTED";
    const now = new Date();
    const updateData: {
      approval_status: "APPROVED" | "REJECTED";
      approval_reason?: string | null;
      rejected_reason?: string | null;
      approved_by?: number | null;
      approved_at?: Date | null;
      onboarding_completed?: boolean | null;
      onboarding_completed_at?: Date | null;
    } = {
      approval_status,
      approved_by: systemUserId,
      approved_at: now,
    };
    if (action === "approve") {
      updateData.approval_reason = reason ?? null;
      updateData.rejected_reason = null;
      updateData.onboarding_completed = true;
      updateData.onboarding_completed_at = now;
    } else {
      updateData.rejected_reason = reason ?? null;
      updateData.approval_reason = null;
    }

    const updated = await updateMerchantStore(storeId, areaManagerId, updateData);
    if (!updated) {
      return NextResponse.json(
        { success: false, error: "Update failed" },
        { status: 500 }
      );
    }

    if (systemUserId != null) {
      await logAreaManagerActivity({
        actorId: systemUserId,
        action: action === "approve" ? "STORE_VERIFIED" : "STORE_REJECTED",
        entityType: "store",
        entityId: storeId,
      });
    }

    await logActionByAuth(
      user.id,
      user.email,
      "MERCHANT",
      action === "approve" ? "UPDATE" : "UPDATE",
      {
        resourceType: "store",
        resourceId: String(storeId),
        actionDetails: { verification: action, reason },
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
        requestPath: request.nextUrl.pathname,
        requestMethod: "POST",
      }
    );

    const storeEmail =
      typeof store.store_email === "string" && store.store_email.trim() !== ""
        ? store.store_email.trim()
        : null;
    if (storeEmail && messageToOwner) {
      const subject =
        action === "approve"
          ? `Store ${store.store_id} – Approved`
          : `Store ${store.store_id} – Verification decision`;
      await sendEmail({
        to: storeEmail,
        subject,
        text: messageToOwner,
      });
    }

    return NextResponse.json({
      success: true,
      store: {
        id: updated.id,
        store_id: updated.store_id,
        approval_status: updated.approval_status,
      },
    });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/verify]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
