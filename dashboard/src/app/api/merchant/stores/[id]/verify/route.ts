/**
 * POST /api/merchant/stores/[id]/verify
 * Approve or reject a store (MERCHANT dashboard: agents / area managers / super admin).
 * Persists optional admin note as approval_reason (approve) or rejected_reason (reject).
 * Sends partner-branded HTML email (SMTP preferred; Resend fallback).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getMerchantAccess } from "@/lib/permissions/merchant-access";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import { logAreaManagerActivity } from "@/lib/area-manager/activity";
import { logActionByAuth, getIpAddress, getUserAgent } from "@/lib/audit/logger";
import { sendEmail } from "@/lib/email/send";
import {
  buildStoreApprovedEmail,
  buildStoreRejectedEmail,
} from "@/lib/email/store-verification-templates";
import { resolveVerificationRecipientEmail } from "@/lib/email/resolve-verification-recipient";

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

    const access = await getMerchantAccess(user.id, user.email);
    if (!access) {
      return NextResponse.json(
        {
          success: false,
          error: "Merchant access not found",
          code: "MERCHANT_ACCESS_REQUIRED",
        },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = body.action === "reject" ? "reject" : "approve";
    const reasonField = typeof body.reason === "string" ? body.reason.trim() : "";
    const messageField = typeof body.message === "string" ? body.message.trim() : "";

    if (action === "approve" && !access.can_approve_store) {
      return NextResponse.json(
        {
          success: false,
          error: "You do not have permission to approve stores",
          code: "PERMISSION_DENIED",
        },
        { status: 403 }
      );
    }
    if (action === "reject" && !access.can_reject_store) {
      return NextResponse.json(
        {
          success: false,
          error: "You do not have permission to reject stores",
          code: "PERMISSION_DENIED",
        },
        { status: 403 }
      );
    }
    if (action === "reject") {
      const rejectionText = reasonField || messageField;
      if (!rejectionText) {
        return NextResponse.json(
          { success: false, error: "Rejection reason is required", code: "REJECTION_REASON_REQUIRED" },
          { status: 400 }
        );
      }
    }

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
      // UI sends optional admin note in `message` (not `reason`); persist as approval_reason.
      updateData.approval_reason = messageField || null;
      updateData.rejected_reason = null;
      updateData.onboarding_completed = true;
      updateData.onboarding_completed_at = now;
    } else {
      updateData.rejected_reason = reasonField || messageField || null;
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
      "UPDATE",
      {
        resourceType: "store",
        resourceId: String(storeId),
        actionDetails: {
          verification: action,
          message: messageField || null,
          reason: action === "reject" ? reasonField || messageField || null : null,
        },
        previousValues: {
          approval_status: currentStatus,
          approval_reason: store.approval_reason ?? null,
          rejected_reason: store.rejected_reason ?? null,
        },
        newValues: {
          approval_status,
          approval_reason: updateData.approval_reason ?? null,
          rejected_reason: updateData.rejected_reason ?? null,
        },
        ipAddress: getIpAddress(request),
        userAgent: getUserAgent(request),
        requestPath: request.nextUrl.pathname,
        requestMethod: "POST",
      }
    );

    const recipientEmail = await resolveVerificationRecipientEmail(storeId, store.store_email);

    const dashboardUrl =
      process.env.PARTNER_DASHBOARD_URL?.trim() || "https://partner.gatimitra.com/auth/post-login";

    type EmailNotify = {
      attempted: boolean;
      sent: boolean;
      skippedReason?:
        | "NO_RECIPIENT"
        | "NOT_CONFIGURED"
        | "SMTP_AUTH_FAILED"
        | "SMTP_ERROR"
        | "RESEND_ERROR";
    };
    const emailNotify: EmailNotify = { attempted: false, sent: false };

    if (recipientEmail) {
      emailNotify.attempted = true;
      if (action === "approve") {
        const { subject, text, html } = buildStoreApprovedEmail({
          storeName: store.store_name,
          storePublicId: store.store_id,
          dashboardUrl,
        });
        const outcome = await sendEmail({ to: recipientEmail, subject, text, html });
        emailNotify.sent = outcome.ok;
        if (!outcome.ok) emailNotify.skippedReason = outcome.code;
        if (outcome.ok) {
          console.log("[verify] Approval email sent to", recipientEmail);
        }
      } else {
        const rejectionBody = reasonField || messageField;
        const { subject, text, html } = buildStoreRejectedEmail({
          storeName: store.store_name,
          storePublicId: store.store_id,
          dashboardUrl,
          reason: rejectionBody,
        });
        const outcome = await sendEmail({ to: recipientEmail, subject, text, html });
        emailNotify.sent = outcome.ok;
        if (!outcome.ok) emailNotify.skippedReason = outcome.code;
        if (outcome.ok) {
          console.log("[verify] Rejection email sent to", recipientEmail);
        }
      }
    } else {
      emailNotify.skippedReason = "NO_RECIPIENT";
      console.warn(
        "[verify] No store_email or agreement signer_email; skipping verification email",
        { storeId: store.id }
      );
    }

    return NextResponse.json({
      success: true,
      store: {
        id: updated.id,
        store_id: updated.store_id,
        approval_status: updated.approval_status,
      },
      email: emailNotify,
    });
  } catch (e) {
    console.error("[POST /api/merchant/stores/[id]/verify]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
