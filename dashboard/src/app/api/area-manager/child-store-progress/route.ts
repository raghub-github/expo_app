/**
 * GET/POST /api/area-manager/child-store-progress
 * Load or save child store onboarding progress (steps 1–9, form_data).
 * Uses merchant_store_registration_progress; store must belong to the area manager.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireAreaManagerApiAuth, requireMerchantManager } from "@/lib/area-manager/auth";
import { getMerchantStoreByIdOnly, getMerchantStoreForProgress, getMerchantStoreStep1Fields, getParentDetailsByParentId } from "@/lib/db/operations/merchant-stores";
import { getChildStoreProgress, upsertChildStoreProgress } from "@/lib/db/operations/child-store-progress";
import { getSql } from "@/lib/db/client";

export const runtime = "nodejs";

type MenuImageBundleEntry = {
  id?: string;
  url?: string;
  file_name?: string;
  verification_status?: string;
};

function parseMenuImageBundle(value: unknown): MenuImageBundleEntry[] {
  if (Array.isArray(value)) return value as MenuImageBundleEntry[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? (parsed as MenuImageBundleEntry[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const getAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    };
    const authResult = await requireAreaManagerApiAuth(getAuthUser);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const storeInternalIdParam = req.nextUrl.searchParams.get("storeInternalId");
    const parentIdParam = req.nextUrl.searchParams.get("parentId");
    const storeInternalId = storeInternalIdParam ? parseInt(storeInternalIdParam, 10) : null;
    const parentId = parentIdParam ? parseInt(parentIdParam, 10) : null;

    if (storeInternalId == null || !Number.isFinite(storeInternalId)) {
      return NextResponse.json({ error: "storeInternalId is required" }, { status: 400 });
    }

    const store = await getMerchantStoreByIdOnly(storeInternalId);
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }
    const effectiveParentId = store.parent_id;

    const progress = await getChildStoreProgress(effectiveParentId, storeInternalId);
    const formData = (progress?.form_data as Record<string, unknown>) ?? {};
    const stepStore = { storeDbId: storeInternalId, storePublicId: store.store_id };
    let formDataWithStepStore: Record<string, unknown> = {
      ...formData,
      step_store: { ...(formData.step_store as object ?? {}), ...stepStore },
    } as Record<string, unknown> & { step1?: Record<string, unknown> };

    // If payment has been successfully captured on Partner Site, automatically
    // advance onboarding to at least step 8 so AM dashboard reflects it.
    let effectiveCurrentStep = progress?.current_step ?? 1;
    if (effectiveParentId != null) {
      // Step 7 → 8: onboarding payment captured
      if (effectiveCurrentStep < 8) {
        try {
          const sql = getSql();
          const rows = await sql`
            SELECT id
            FROM merchant_onboarding_payments
            WHERE merchant_parent_id = ${effectiveParentId}
              AND merchant_store_id = ${storeInternalId}
              AND status = 'captured'
            ORDER BY created_at DESC
            LIMIT 1
          `;
          const row = Array.isArray(rows) ? rows[0] : rows;
          if (row) {
            const bumped = Math.max(effectiveCurrentStep, 8);
            await upsertChildStoreProgress({
              parentId: effectiveParentId,
              storeInternalId,
              currentStep: bumped,
              formDataPatch: null,
            });
            effectiveCurrentStep = bumped;
          }
        } catch {
          // If payment table is unavailable, ignore and fall back to existing progress.
        }
      }

      // Step 8 → 9: agreement accepted & digitally signed on Partner Site
      if (effectiveCurrentStep < 9) {
        try {
          const sql = getSql();
          const rows = await sql`
            SELECT id
            FROM merchant_store_agreement_acceptances
            WHERE store_id = ${storeInternalId}
              AND terms_accepted = true
              AND contract_read_confirmed = true
              AND digital_signature_confirmed = true
            ORDER BY accepted_at DESC
            LIMIT 1
          `;
          const row = Array.isArray(rows) ? rows[0] : rows;
          if (row) {
            const bumped = Math.max(effectiveCurrentStep, 9);
            await upsertChildStoreProgress({
              parentId: effectiveParentId,
              storeInternalId,
              currentStep: bumped,
              formDataPatch: null,
            });
            effectiveCurrentStep = bumped;
          }
        } catch {
          // If agreement table is unavailable, ignore and fall back to existing progress.
        }
      }
    }

    const step1FromStore = await getMerchantStoreStep1Fields(storeInternalId);
    if (step1FromStore) {
      const existingStep1 = (formDataWithStepStore.step1 as Record<string, unknown>) ?? {};
      formDataWithStepStore = {
        ...formDataWithStepStore,
        step1: {
          ...existingStep1,
          store_name: step1FromStore.store_name ?? existingStep1.store_name,
          owner_full_name: step1FromStore.owner_full_name ?? existingStep1.owner_full_name,
          store_display_name: step1FromStore.store_display_name ?? existingStep1.store_display_name,
          store_description: step1FromStore.store_description ?? existingStep1.store_description,
          store_email: step1FromStore.store_email ?? existingStep1.store_email,
          store_phones: step1FromStore.store_phones ?? existingStep1.store_phones,
          store_type: step1FromStore.store_type ?? existingStep1.store_type,
          custom_store_type: step1FromStore.custom_store_type ?? existingStep1.custom_store_type,
        },
      };
    }

    // Always hydrate Step 3 menu attachments from DB media table so UI reflects latest data,
    // even if registration_progress step3 is stale or missing.
    try {
      const sql = getSql();
      const mediaRows = await sql`
        SELECT id, source_entity, original_file_name, r2_key, public_url, menu_reference_image_urls, created_at
        FROM merchant_store_media_files
        WHERE store_id = ${storeInternalId}
          AND media_scope = 'MENU_REFERENCE'
          AND is_active = true
          AND deleted_at IS NULL
        ORDER BY created_at DESC
      `;
      const rows = (Array.isArray(mediaRows) ? mediaRows : mediaRows ? [mediaRows] : []) as Array<{
        id: number | string;
        source_entity: string | null;
        original_file_name: string | null;
        r2_key: string | null;
        public_url: string | null;
        menu_reference_image_urls: unknown;
      }>;

      const imageRow =
        rows.find((r) => r.source_entity === "ONBOARDING_MENU_IMAGE") ?? null;
      const pdfRow =
        rows.find((r) => r.source_entity === "ONBOARDING_MENU_PDF") ?? null;
      const sheetRow =
        rows.find((r) => r.source_entity === "ONBOARDING_MENU_SHEET") ?? null;

      const imageBundle = imageRow ? parseMenuImageBundle(imageRow.menu_reference_image_urls) : [];
      const imageUrls = imageBundle
        .map((entry) => (typeof entry.url === "string" ? entry.url : ""))
        .filter(Boolean);
      const imageNames = imageBundle
        .map((entry) => (typeof entry.file_name === "string" ? entry.file_name : ""))
        .filter(Boolean);

      const step3FromDb: Record<string, unknown> = {
        menuUploadMode: imageUrls.length
          ? "IMAGE"
          : pdfRow
            ? "PDF"
            : sheetRow
              ? "CSV"
              : ((formDataWithStepStore.step3 as Record<string, unknown> | undefined)?.menuUploadMode ?? "IMAGE"),
        menuImageUrls: imageUrls,
        menuImageNames: imageNames,
        menuPdfUrl: pdfRow?.public_url ?? null,
        menuPdfFileName: pdfRow?.original_file_name ?? null,
        menuPdfR2Key: pdfRow?.r2_key ?? null,
        menuSpreadsheetUrl: sheetRow?.public_url ?? null,
        menuSpreadsheetName: sheetRow?.original_file_name ?? null,
        menuSpreadsheetR2Key: sheetRow?.r2_key ?? null,
        // Keep only numeric ids (used by existing UI in a few places).
        menuUploadIds: [
          pdfRow?.id != null && Number.isFinite(Number(pdfRow.id)) ? Number(pdfRow.id) : null,
          sheetRow?.id != null && Number.isFinite(Number(sheetRow.id)) ? Number(sheetRow.id) : null,
        ].filter((v): v is number => v != null),
      };

      formDataWithStepStore = {
        ...formDataWithStepStore,
        step3: {
          ...((formDataWithStepStore.step3 as Record<string, unknown>) ?? {}),
          ...step3FromDb,
        },
      };
    } catch {
      // Non-fatal: if media query fails, keep existing progress payload.
    }

    let parent_name: string | null = null;
    let parent_merchant_id: string | null = null;
    if (effectiveParentId != null) {
      const parentDetails = await getParentDetailsByParentId(effectiveParentId);
      parent_name = parentDetails.parent_name;
      parent_merchant_id = parentDetails.parent_merchant_id;
    }

    const res = NextResponse.json({
      success: true,
      parent_name: parent_name ?? undefined,
      parent_merchant_id: parent_merchant_id ?? undefined,
      progress: {
        current_step: effectiveCurrentStep,
        form_data: formDataWithStepStore,
      },
    });
    // Ensure AM always sees latest data (including edits from Partner Site); no cache
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  } catch (e) {
    console.error("[GET /api/area-manager/child-store-progress]", e);
    return NextResponse.json({ error: "Failed to load progress" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const getAuthUser = async () => {
      const { data } = await supabase.auth.getUser();
      return data?.user ?? null;
    };
    const authResult = await requireAreaManagerApiAuth(getAuthUser);
    if (authResult.error) return authResult.error;
    const err = requireMerchantManager(authResult.resolved);
    if (err) return err;

    const body = await req.json().catch(() => ({}));
    const storeInternalId = body.storeInternalId != null ? Number(body.storeInternalId) : null;
    const parentId = body.parentId != null ? Number(body.parentId) : null;
    const currentStep = body.currentStep != null ? Math.min(Math.max(Number(body.currentStep), 1), 9) : 1;
    let formDataPatch = body.formDataPatch != null && typeof body.formDataPatch === "object" ? body.formDataPatch : undefined;

    if (storeInternalId == null || !Number.isFinite(storeInternalId)) {
      return NextResponse.json({ error: "storeInternalId is required" }, { status: 400 });
    }

    const areaManagerId = authResult.resolved.isSuperAdmin ? null : authResult.resolved.areaManager?.id ?? null;
    // Relax store lookup to only use internal ID; AM access is already enforced above.
    // This avoids false 404s when parentId in URL/body does not exactly match filters used by getMerchantStoreForProgress.
    const store = await getMerchantStoreByIdOnly(storeInternalId);
    if (!store) {
      return NextResponse.json({ error: "Store not found or access denied" }, { status: 404 });
    }
    const effectiveParentId = store.parent_id;

    const stepStore = { storeDbId: storeInternalId, storePublicId: store.store_id };
    formDataPatch = { ...(formDataPatch ?? {}), step_store: { ...((formDataPatch?.step_store as object) ?? {}), ...stepStore } };

    const result = await upsertChildStoreProgress({
      parentId: effectiveParentId,
      storeInternalId,
      currentStep,
      formDataPatch: formDataPatch ?? null,
    });

    return NextResponse.json({ success: true, current_step: result.current_step });
  } catch (e) {
    console.error("[POST /api/area-manager/child-store-progress]", e);
    return NextResponse.json({ error: "Failed to save progress" }, { status: 500 });
  }
}
