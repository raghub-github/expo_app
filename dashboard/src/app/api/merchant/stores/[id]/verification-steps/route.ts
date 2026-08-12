/**
 * GET /api/merchant/stores/[id]/verification-steps
 * POST /api/merchant/stores/[id]/verification-steps (body: { step: number, notes?: string })
 * Step-by-step verification for 8 onboarding steps (6 = bank account, 7 = commission, 8 = agreement).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasDashboardAccessByAuth, isSuperAdmin } from "@/lib/permissions/engine";
import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";
import { getSystemUserByEmail } from "@/lib/auth/user-mapping";
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
import { buildStepApprovedEmail, buildVerificationStepRejectedEmail } from "@/lib/email/store-verification-templates";
import { labelsForRejectedFields } from "@/lib/merchants/step-rejection-fields";
import { resolveVerificationRecipientEmail } from "@/lib/email/resolve-verification-recipient";
import { logStoreActivity } from "@/lib/db/operations/store-activity-feed";
import { applyPendingStepResubmissions } from "@/lib/db/operations/onboarding-resubmissions";

export const runtime = "nodejs";

/** Safe body parse — empty/invalid JSON must not crash the route (Next can throw SyntaxError). */
async function readJsonBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const text = await request.text();
    if (!text || !text.trim()) return {};
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}

type StoreAccessDenied = { allowed: false; status: number; error: string };
type StoreAccessGranted = {
  allowed: true;
  user: { id: string; email: string };
  systemUserId: number | null;
  systemUserName: string;
  store: NonNullable<Awaited<ReturnType<typeof getMerchantStoreById>>>;
  areaManagerId: number | null;
};

async function allowStoreAccess(storeId: number): Promise<StoreAccessDenied | StoreAccessGranted> {
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
  const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });
  const store = await getMerchantStoreById(storeId, areaManagerId);
  if (!store) {
    return { allowed: false as const, status: 404, error: "Store not found" };
  }
  const systemUser = await getSystemUserByEmail(user.email);
  return {
    allowed: true as const,
    user: { id: user.id, email: user.email },
    systemUserId: systemUser?.id ?? null,
    systemUserName: systemUser?.full_name?.trim() || user.email,
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
    const body = await readJsonBody(request);
    const step = typeof body.step === "number" ? Math.floor(body.step) : undefined;
    if (step == null || step < 1 || step > 8) {
      return NextResponse.json(
        { success: false, error: "Invalid step (required: 1–8)" },
        { status: 400 }
      );
    }
    const adminOverride = !!body.admin_override || !!body.override;
    const notes =
      typeof body.notes === "string" ? body.notes.trim() || null : adminOverride ? "ADMIN_OVERRIDE" : null;
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
    const verifiedByName = access.systemUserName || access.user.email || "agent";
    let hadRejectionBefore = false;
    if (adminOverride) {
      try {
        const sql = getSql();
        const rejRows = await sql`
          SELECT 1
          FROM store_verification_step_rejections
          WHERE store_id = ${storeId} AND step_number = ${step}
          LIMIT 1
        `;
        hadRejectionBefore = Array.isArray(rejRows) && rejRows.length > 0;
      } catch {
        hadRejectionBefore = false;
      }
    }
    // Promote staged New → live tables (+ delete replaced R2) before marking verified.
    let pendingApplied = 0;
    try {
      pendingApplied = await applyPendingStepResubmissions({
        storeId,
        verificationStep: step,
        appliedBySystemUserId: access.systemUserId ?? null,
      });
    } catch (e) {
      console.warn("[verification-steps] applyPendingStepResubmissions:", e);
      return NextResponse.json(
        {
          success: false,
          error:
            "Failed to apply resubmitted values to the store. Fix storage/data and try Verify again.",
        },
        { status: 500 }
      );
    }
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

    if (adminOverride) {
      try {
        const previousStatus = hadRejectionBefore ? "REJECTED" : "PENDING";
        await logStoreActivity({
          storeId,
          section: "onboarding_step",
          action: "ADMIN_OVERRIDE_VERIFY",
          entityId: step,
          entityName: STEP_LABELS[step] ?? `Step ${step}`,
          summary: `Admin override verification: ${previousStatus} -> VERIFIED (step ${step})`,
          actorType: "agent",
          actorId: access.systemUserId ?? null,
          actorEmail: access.user?.email ?? null,
          actorName: access.systemUserName ?? access.user?.email ?? null,
          source: "dashboard",
          diff: { adminOverride: true },
        });

        const recipientEmail = await resolveVerificationRecipientEmail(storeId, (access.store as any).store_email);
        if (recipientEmail) {
          const dashboardUrl =
            process.env.PARTNER_DASHBOARD_URL?.trim() || "https://partner.gatimitra.com/auth/post-login";
          const { subject, text, html } = buildStepApprovedEmail({
            storeName: (access.store as any).store_name,
            storePublicId: (access.store as any).store_id ? String((access.store as any).store_id) : `GMMC${storeId}`,
            dashboardUrl,
            stepLabel: STEP_LABELS[step] ?? `Step ${step}`,
          });
          await sendEmail({ to: recipientEmail, subject, text, html });
        }
      } catch (mailErr) {
        console.warn("[POST verification-steps] admin override email/log failed:", mailErr);
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
    return NextResponse.json({
      success: true,
      steps: byStep,
      edits: editsByStep,
      pendingApplied,
    });
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
    const body = await readJsonBody(request);
    const step = typeof body.step === "number" ? Math.floor(body.step) : undefined;
    if (step == null || step < 1 || step > 8) {
      return NextResponse.json(
        { success: false, error: "Invalid step (required: 1–8)" },
        { status: 400 }
      );
    }

    // Captured onboarding payment auto-verifies commission plan — do not allow reject/unverify.
    if (step === 7) {
      try {
        const sql = getSql();
        const payRows = await sql`
          SELECT id
          FROM merchant_onboarding_payments
          WHERE merchant_store_id = ${storeId}
            AND (
              LOWER(COALESCE(status, '')) = 'captured'
              OR LOWER(COALESCE(razorpay_status, '')) = 'captured'
            )
          LIMIT 1
        `;
        const hasCaptured = Array.isArray(payRows) ? payRows.length > 0 : !!payRows;
        if (hasCaptured) {
          return NextResponse.json(
            {
              success: false,
              error:
                "Commission plan is auto-verified because onboarding payment was captured. Reject is not allowed.",
            },
            { status: 409 }
          );
        }
      } catch (e) {
        console.warn("[DELETE verification-steps] payment capture check failed:", e);
      }
    }

    const rejectionReason =
      typeof body.rejection_reason === "string" ? body.rejection_reason.trim() : "";
    if (rejectionReason.length > 0 && rejectionReason.length < 3) {
      return NextResponse.json(
        { success: false, error: "Rejection reason must be at least a few characters" },
        { status: 400 }
      );
    }
    const rejectedFieldsRaw: string[] = Array.isArray(body.rejected_fields)
      ? body.rejected_fields.filter((x: unknown): x is string => typeof x === "string" && !!String(x).trim())
      : [];
    const clientStepDetail =
      body.step_rejection_detail &&
      typeof body.step_rejection_detail === "object" &&
      !Array.isArray(body.step_rejection_detail)
        ? (body.step_rejection_detail as Record<string, unknown>)
        : null;
    if (
      rejectedFieldsRaw.length === 0 &&
      clientStepDetail &&
      Array.isArray(clientStepDetail.rejected_fields)
    ) {
      for (const x of clientStepDetail.rejected_fields) {
        if (typeof x === "string" && x.trim()) rejectedFieldsRaw.push(x.trim());
      }
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
        const rejectedFieldLabels = labelsForRejectedFields(step, rejectedFieldsRaw);
        const { subject, text, html } = buildVerificationStepRejectedEmail({
          storeName: access.store.store_name,
          storePublicId: access.store.store_id,
          dashboardUrl,
          stepNumber: step,
          stepLabel,
          reason: rejectionReason,
          rejectedFieldLabels,
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
      } else if (rejectedFieldsRaw.length > 0 || clientStepDetail) {
        const clientVersion = Number(clientStepDetail?.version ?? 0);
        const clientFields = Array.isArray(clientStepDetail?.fields)
          ? clientStepDetail!.fields
          : null;
        if (clientVersion >= 2 && clientFields && clientFields.length > 0) {
          // Prefer full v2 metadata from admin (per-field reasons + previousValue).
          stepRejectionDetail = {
            ...clientStepDetail,
            version: 2,
            fields: clientFields,
            rejected_fields:
              rejectedFieldsRaw.length > 0
                ? rejectedFieldsRaw
                : Array.isArray(clientStepDetail?.rejected_fields)
                  ? clientStepDetail!.rejected_fields
                  : [],
          };
        } else {
          const fields =
            rejectedFieldsRaw.length > 0
              ? rejectedFieldsRaw
              : Array.isArray(clientStepDetail?.rejected_fields)
                ? (clientStepDetail!.rejected_fields as unknown[]).filter(
                    (x): x is string => typeof x === "string" && !!x.trim()
                  )
                : [];
          if (fields.length > 0) {
            stepRejectionDetail = {
              version: 1,
              rejected_fields: fields,
              ...(typeof clientStepDetail?.note === "string" && clientStepDetail.note.trim()
                ? { note: String(clientStepDetail.note).trim() }
                : {}),
            };
          }
        }
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
