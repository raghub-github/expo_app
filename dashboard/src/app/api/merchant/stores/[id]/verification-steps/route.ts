/**
 * GET /api/merchant/stores/[id]/verification-steps
 * POST /api/merchant/stores/[id]/verification-steps (body: { step: number, notes?: string })
 * Step-by-step verification for 8 onboarding steps (6 = bank account, 7 = commission, 8 = agreement).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
import { getAreaManagerByUserId } from "@/lib/area-manager/auth";
import { getMerchantStoreById, updateMerchantStore } from "@/lib/db/operations/merchant-stores";
import {
  getStoreVerificationStepEdits,
  upsertStoreVerificationStep,
  deleteStoreVerificationStep,
  getStoreVerificationStepsApiRows,
  upsertStoreVerificationStepRejection,
  clearStoreVerificationStepRejection,
} from "@/lib/db/operations/store-verification-steps";
import { getSql } from "@/lib/db/client";
import {
  aggregateBundleVerificationStatus,
  parseMenuReferenceImageUrls,
  setAllBundleEntryStatuses,
  setBundleEntriesRejectedPreservingVerified,
} from "@/lib/menu-reference-image-bundle";
import { buildMenuReferenceRejectionDetailSnapshot } from "@/lib/store-verification-menu-rejection-detail";
import { sendEmail } from "@/lib/email/send";
import { buildVerificationStepRejectedEmail } from "@/lib/email/store-verification-templates";
import { resolveVerificationRecipientEmail } from "@/lib/email/resolve-verification-recipient";

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
    systemUserName: systemUser?.full_name?.trim() || user.email,    store,
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
    const byStep = await getStoreVerificationStepsApiRows(storeId);
    let edits: Awaited<ReturnType<typeof getStoreVerificationStepEdits>> = [];
    try {
      edits = await getStoreVerificationStepEdits(storeId);
    } catch (editsErr) {
      console.warn("[GET verification-steps] edits table may not exist:", editsErr);
    }
    const editsByStep: Record<number, Array<{ field_key: string; old_value: string | null; new_value: string | null; edited_by: number | null; edited_by_name: string | null; edited_at: string }>> = {};
    for (let i = 1; i <= 8; i++) editsByStep[i] = [];
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
    if (step == null || step < 1 || step > 8) {
      return NextResponse.json(
        { success: false, error: "Invalid step (required: 1–8)" },
        { status: 400 }
      );
    }
    const notes = typeof body.notes === "string" ? body.notes.trim() || null : null;
    const verifiedByName = access.systemUserName || access.user.email || "agent";    const ok = await upsertStoreVerificationStep({
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
    await clearStoreVerificationStepRejection(storeId, step);
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
        const imgRows = await sql`
          SELECT id, menu_reference_image_urls
          FROM merchant_store_media_files
          WHERE store_id = ${storeId}
            AND media_scope = 'MENU_REFERENCE'
            AND source_entity = 'ONBOARDING_MENU_IMAGE'
            AND is_active = true
            AND deleted_at IS NULL
        `;
        const list = Array.isArray(imgRows) ? imgRows : [imgRows];
        for (const r of list) {
          const row = r as { id: unknown; menu_reference_image_urls: unknown };
          const next = setAllBundleEntryStatuses(row.menu_reference_image_urls, "VERIFIED");
          if (next) {
            const bundleJson = JSON.stringify(next);
            await sql`
              UPDATE merchant_store_media_files
              SET menu_reference_image_urls = ${bundleJson}::jsonb, updated_at = now()
              WHERE id = ${Number(row.id)}
                AND store_id = ${storeId}
            `;
          }
        }
      } catch (mediaErr) {
        console.warn("[POST verification-steps] failed to update menu media verification_status:", mediaErr);
      }
    }
    if (step === 6) {
      try {
        const sql = getSql();
        const verifiedBy = access.systemUserId ?? null;
        await sql`
          UPDATE merchant_store_bank_accounts m
          SET
            is_verified = true,
            verified_at = now(),
            verified_by = ${verifiedBy},
            verification_method = 'dashboard_agent',
            verification_status = COALESCE(m.verification_status, 'verified')
          WHERE m.id = (
            SELECT b.id
            FROM merchant_store_bank_accounts b
            WHERE b.store_id = ${storeId}
              AND COALESCE(b.is_active, true) = true
              AND COALESCE(b.is_disabled, false) = false
            ORDER BY COALESCE(b.is_primary, false) DESC, b.id ASC
            LIMIT 1
          )
        `;
      } catch (bankErr) {
        console.warn("[POST verification-steps] bank account sync failed:", bankErr);
      }
    }
    // Once any step (1–8) is verified, move store into UNDER_VERIFICATION
    const currentStatus = (access.store.approval_status || "").toUpperCase();
    if (
      step >= 1 &&
      step <= 8 &&
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
    const byStep = await getStoreVerificationStepsApiRows(storeId);
    let edits: Awaited<ReturnType<typeof getStoreVerificationStepEdits>> = [];
    try {
      edits = await getStoreVerificationStepEdits(storeId);
    } catch (editsErr) {
      console.warn("[POST verification-steps] edits table may not exist:", editsErr);
    }
    const editsByStep: Record<number, Array<{ field_key: string; old_value: string | null; new_value: string | null; edited_by: number | null; edited_by_name: string | null; edited_at: string }>> = {};
    for (let i = 1; i <= 8; i++) editsByStep[i] = [];
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
 * Body: { step: number, rejection_reason?: string }.
 * Un-verifies the step. If rejection_reason is set (≥3 chars), emails the store with step + reason.
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
    if (step == null || step < 1 || step > 8) {
      return NextResponse.json(
        { success: false, error: "Invalid step (required: 1–8)" },
        { status: 400 }
      );
    }
    const rejectionReason =
      typeof body.rejection_reason === "string" ? body.rejection_reason.trim() : "";
    if (rejectionReason.length > 0 && rejectionReason.length < 3) {
      return NextResponse.json(
        { success: false, error: "Rejection reason must be at least a few characters" },
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

    if (step === 6) {
      try {
        const sql = getSql();
        await sql`
          UPDATE merchant_store_bank_accounts
          SET
            is_verified = false,
            verified_at = null,
            verified_by = null,
            verification_method = NULL
          WHERE store_id = ${storeId}
            AND verification_method = 'dashboard_agent'
        `;
      } catch (bankErr) {
        console.warn("[DELETE verification-steps] bank account reset failed:", bankErr);
      }
    }

    type EmailNotify = {
      attempted: boolean;
      sent: boolean;
      skippedReason?: "NO_RECIPIENT" | "NOT_CONFIGURED" | "SMTP_AUTH_FAILED" | "SMTP_ERROR" | "RESEND_ERROR";
    };
    const emailNotify: EmailNotify = { attempted: false, sent: false };

    const STEP_LABELS: Record<number, string> = {
      1: "Restaurant information",
      2: "Location details",
      3: "Menu setup",
      4: "Restaurant documents",
      5: "Operational details",
      6: "Bank account",
      7: "Commission plan",
      8: "Sign & submit",
    };
    const stepLabel = STEP_LABELS[step] ?? `Step ${step}`;

    if (rejectionReason.length >= 3) {
      emailNotify.attempted = true;
      const recipientEmail = await resolveVerificationRecipientEmail(storeId, access.store.store_email);
      const dashboardUrl =
        process.env.PARTNER_DASHBOARD_URL?.trim() || "https://partner.gatimitra.com/auth/post-login";
      if (recipientEmail) {
        const { subject, text, html } = buildVerificationStepRejectedEmail({
          storeName: access.store.store_name,
          storePublicId: access.store.store_id,
          dashboardUrl,
          stepNumber: step,
          stepLabel,
          reason: rejectionReason,
        });
        const outcome = await sendEmail({ to: recipientEmail, subject, text, html });
        emailNotify.sent = outcome.ok;
        if (!outcome.ok) emailNotify.skippedReason = outcome.code;
        if (outcome.ok) {
          console.log("[DELETE verification-steps] Step rejection email sent to", recipientEmail, { step });
        }
      } else {
        emailNotify.skippedReason = "NO_RECIPIENT";
        console.warn("[DELETE verification-steps] No recipient email for step rejection", { storeId, step });
      }
      const rejectedByName =
        (typeof access.systemUserName === "string" && access.systemUserName.trim()
          ? access.systemUserName.trim()
          : null) ?? access.user?.email ?? null;
      let stepRejectionDetail: unknown = null;
      if (step === 3) {
        stepRejectionDetail = await buildMenuReferenceRejectionDetailSnapshot(storeId);
      }
      await upsertStoreVerificationStepRejection({
        storeId,
        stepNumber: step,
        reason: rejectionReason,
        stepLabel,
        rejectedBy: access.systemUserId ?? null,
        rejectedByName,
        emailSent: emailNotify.sent,
        emailSkipReason: emailNotify.sent ? null : emailNotify.skippedReason ?? "UNKNOWN",
        stepRejectionDetail,
      });
      if (step === 3) {
        try {
          const sql = getSql();
          const menuRows = await sql`
            SELECT id, source_entity, menu_reference_image_urls
            FROM merchant_store_media_files
            WHERE store_id = ${storeId}
              AND media_scope = 'MENU_REFERENCE'
              AND is_active = true
              AND deleted_at IS NULL
          `;
          const list = Array.isArray(menuRows) ? menuRows : [menuRows];
          const systemVerifierId = access.systemUserId ?? null;
          for (const r of list) {
            const row = r as {
              id: unknown;
              source_entity: unknown;
              menu_reference_image_urls: unknown;
            };
            const rowId = Number(row.id);
            const sourceEntity = row.source_entity != null ? String(row.source_entity) : "";
            if (sourceEntity === "ONBOARDING_MENU_IMAGE") {
              const next = setBundleEntriesRejectedPreservingVerified(row.menu_reference_image_urls);
              if (next) {
                const bundleJson = JSON.stringify(next);
                const entries = parseMenuReferenceImageUrls(next);
                const agg = aggregateBundleVerificationStatus(entries);
                const verifiedAt = agg === "VERIFIED" ? new Date() : null;
                const verifiedBy = agg === "VERIFIED" ? systemVerifierId : null;
                await sql`
                  UPDATE merchant_store_media_files
                  SET menu_reference_image_urls = ${bundleJson}::jsonb,
                      verification_status = ${agg},
                      verified_at = ${verifiedAt},
                      verified_by = ${verifiedBy},
                      updated_at = now()
                  WHERE id = ${rowId}
                    AND store_id = ${storeId}
                `;
              } else {
                await sql`
                  UPDATE merchant_store_media_files
                  SET verification_status = 'REJECTED',
                      verified_at = null,
                      verified_by = null,
                      updated_at = now()
                  WHERE id = ${rowId}
                    AND store_id = ${storeId}
                `;
              }
            } else {
              await sql`
                UPDATE merchant_store_media_files
                SET verification_status = 'REJECTED',
                    verified_at = null,
                    verified_by = null,
                    updated_at = now()
                WHERE id = ${rowId}
                  AND store_id = ${storeId}
              `;
            }
          }
        } catch (mediaRejErr) {
          console.warn(
            "[DELETE verification-steps] failed to mark menu media REJECTED:",
            mediaRejErr
          );
        }
      }
    } else {
      await clearStoreVerificationStepRejection(storeId, step);
    }
    const byStep = await getStoreVerificationStepsApiRows(storeId);
    let edits: Awaited<ReturnType<typeof getStoreVerificationStepEdits>> = [];
    try {
      edits = await getStoreVerificationStepEdits(storeId);
    } catch (editsErr) {
      console.warn("[DELETE verification-steps] edits table may not exist:", editsErr);
    }
    const editsByStep: Record<number, Array<{ field_key: string; old_value: string | null; new_value: string | null; edited_by: number | null; edited_by_name: string | null; edited_at: string }>> = {};
    for (let i = 1; i <= 8; i++) editsByStep[i] = [];
    for (const e of edits) {
      if (editsByStep[e.step_number]) editsByStep[e.step_number].push({ field_key: e.field_key, old_value: e.old_value, new_value: e.new_value, edited_by: e.edited_by, edited_by_name: e.edited_by_name, edited_at: e.edited_at });
    }
    return NextResponse.json({
      success: true,
      steps: byStep,
      edits: editsByStep,
      ...(rejectionReason.length >= 3 ? { email: emailNotify } : {}),
    });
  } catch (e) {
    console.error("[DELETE /api/merchant/stores/[id]/verification-steps]", e);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
