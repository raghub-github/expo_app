import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSessionPreferParent } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";
import { logAuthError, shouldClearSession } from "@/lib/auth/auth-error-handler";
import { extractR2KeyFromUrl, deleteFromR2, toStoredDocumentUrl } from "@/lib/r2";
import { menuSpreadsheetMimeFromFileName } from "@/lib/r2-paths";
import { entriesWithRowMetaFromImageRows, fileNameFromMenuStoredUrl } from "@/lib/menu-reference-image-bundle";
import {
  deepMergeFormData,
  toFreshSignedUrl,
  toMenuProxyUrl,
  toEnumStoreType,
  ProgressFlags,
  STEP_KEYS,
  ProgressFormData,
  ProgressRow,
  buildReconciledFlags,
  countCompletedSteps,
  generateStorePublicId,
  insertStoreAfterStep1,
  upsertStoreDraft,
  syncMerchantStoreFromStep5,
  enrichStep5FromMerchantTables,
  isStep4ActuallyComplete,
  type Step5Supabase,
} from "./helpers";
import {
  markMerchantResubmittedForRejectedSteps,
  partnerOnboardingStepToVerificationResubmitSteps,
  verificationStepsFromFormDataPatch,
} from "@/lib/onboarding/verification-resubmission";
import {
  rejectionDetailForDocType,
  rejectionRequiresNewFileUpload,
} from "@/lib/merchant-store-document-rejection";
import { maskAadhaarNumber } from "@/lib/mask-aadhaar";
import {
  asRecord,
  mergeAutoVerificationMetadata,
  mergeExtractedDataSummary,
  mergeGstFetchedIntoVerifiedDetails,
  pickGstFetchedBusinessInfo,
  verifiedDetailsForUi,
} from "@/lib/merchant-doc-auto-verification";

const STEP4_PREFIX_WATCH_KEYS: Record<string, string[]> = {
  pan: ["pan_document_number", "pan_holder_name"],
  gst: [
    "gst_document_number",
    "gst_legal_business_name",
    "gst_principal_place_of_business",
    "gst_effective_registration_date",
  ],
  aadhaar: ["aadhaar_document_number", "aadhaar_holder_name"],
  fssai: ["fssai_document_number", "fssai_expiry_date"],
  drug_license: ["drug_license_document_number", "drug_license_expiry_date"],
  trade_license: ["trade_license_document_number", "trade_license_expiry_date"],
  shop_establishment: ["shop_establishment_document_number", "shop_establishment_expiry_date"],
  udyam: ["udyam_document_number"],
  pharmacist_certificate: ["pharmacist_certificate_document_number", "pharmacist_certificate_expiry_date"],
  pharmacy_council_registration: ["pharmacy_council_registration_document_name"],
  other: ["other_document_number", "other_document_type", "other_expiry_date"],
  bank_proof: ["bank_proof_document_number"],
};

function normStep4Scalar(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") {
    const t = v.trim();
    if (t.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
    return t;
  }
  return String(v);
}

function step4FieldsChangedForPrefix(
  pfx: string,
  ex: Record<string, unknown>,
  row: Record<string, unknown>
): boolean {
  const ks = STEP4_PREFIX_WATCH_KEYS[pfx];
  if (!ks) return false;
  for (const k of ks) {
    if (normStep4Scalar(ex[k]) !== normStep4Scalar(row[k])) return true;
  }
  return false;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      // Only log actual errors, not missing sessions
      if (userError.message !== 'Auth session missing!') {
        logAuthError('register-store-progress-GET', userError);
      }
      if (shouldClearSession(userError)) {
        return NextResponse.json({ 
          success: false, 
          error: "Session invalid", 
          code: "SESSION_INVALID" 
        }, { status: 401 });
      }
      return NextResponse.json({ 
        success: false, 
        error: userError.message || "Authentication failed" 
      }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    const preferredParentRaw = req.nextUrl.searchParams.get("parent_id");
    const validation = await validateMerchantFromSessionPreferParent(
      {
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
      },
      preferredParentRaw
    );

    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error ?? "Merchant not found",
          code: "MERCHANT_NOT_FOUND",
        },
        { status: 403 }
      );
    }

    const db = getSupabaseAdmin();
    const storePublicId = req.nextUrl.searchParams.get("storePublicId");
    const forceNew = req.nextUrl.searchParams.get("forceNew") === "1";
    const resetDraft = req.nextUrl.searchParams.get("resetDraft") === "1";

    // `new=1` in the URL marks "add store" navigation; only skip saved progress when explicitly reset.
    if (forceNew && resetDraft) {
      return NextResponse.json({ success: true, progress: null });
    }

    let progress: ProgressRow | null = null;
    let err: { message?: string } | null = null;

    const parentId = validation.merchantParentId;

    const assignProgressError = (e: { message?: string } | null) => {
      if (e?.message) err = e;
    };

    // When opening a specific child store (e.g. Review & fix), resolve that store only.
    // Do not fall back to "latest progress for parent" — that returns the wrong store when
    // `.contains` on JSON fails or rows differ only by progress.store_id.
    if (storePublicId) {
      // Resolve store by public id first (any parent), then enforce session ownership.
      const { data: closedStore } = await db
        .from("merchant_stores")
        .select("id, store_id, parent_id, onboarding_completed, approval_status")
        .eq("store_id", storePublicId)
        .maybeSingle();

      if (closedStore?.id && Number(closedStore.parent_id) !== Number(parentId)) {
        return NextResponse.json(
          {
            success: false,
            error: "This store belongs to a different merchant parent.",
            code: "STORE_PARENT_MISMATCH",
          },
          { status: 403 },
        );
      }

      if (closedStore?.onboarding_completed === true) {
        const approval = String(closedStore.approval_status || "").toUpperCase();
        if (approval !== "DRAFT" && approval !== "REJECTED") {
          return NextResponse.json({
            success: true,
            progress: null,
            storeOnboardingClosed: true,
            store: {
              storeDbId: closedStore.id,
              onboarding_completed: true,
              approval_status: closedStore.approval_status,
            },
          });
        }
      }

      if (closedStore?.id && closedStore.onboarding_completed !== true) {
        const { data: completedProgress } = await db
          .from("merchant_store_registration_progress")
          .select("registration_status, completed_at")
          .eq("store_id", closedStore.id)
          .eq("registration_status", "COMPLETED")
          .order("completed_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (completedProgress) {
          const repairApproval =
            String(closedStore.approval_status || "").toUpperCase() === "DRAFT"
              ? "SUBMITTED"
              : closedStore.approval_status;
          const repairedAt = completedProgress.completed_at || new Date().toISOString();
          await db
            .from("merchant_stores")
            .update({
              onboarding_completed: true,
              onboarding_completed_at: repairedAt,
              approval_status: repairApproval,
              current_onboarding_step: 9,
              updated_at: new Date().toISOString(),
            })
            .eq("id", closedStore.id);

          return NextResponse.json({
            success: true,
            progress: null,
            storeOnboardingClosed: true,
            store: {
              storeDbId: closedStore.id,
              onboarding_completed: true,
              approval_status: repairApproval,
              repaired: true,
            },
          });
        }
      }

      // Prefer progress keyed by merchant_stores.id — never JSON contains (collisions).
      if (closedStore?.id) {
        const byStoreId = await db
          .from("merchant_store_registration_progress")
          .select("*")
          .eq("parent_id", parentId)
          .eq("store_id", closedStore.id)
          .neq("registration_status", "COMPLETED")
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        assignProgressError(byStoreId.error);
        if (byStoreId.data) progress = byStoreId.data as ProgressRow;
      }

      if (!progress) {
      const byContains = await db
        .from("merchant_store_registration_progress")
        .select("*")
        .eq("parent_id", parentId)
        .neq("registration_status", "COMPLETED")
        .contains("form_data", { step_store: { storePublicId } })
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      assignProgressError(byContains.error);
      // Only accept contains() hit when store_id column matches the real store (or store unknown).
      if (
        byContains.data &&
        (!closedStore?.id || Number((byContains.data as any).store_id) === Number(closedStore.id))
      ) {
        progress = byContains.data as ProgressRow;
      }
      }

      if (!progress) {
        const { data: storeRow } = await db
          .from("merchant_stores")
          .select("id")
          .eq("parent_id", parentId)
          .eq("store_id", storePublicId)
          .maybeSingle();
        if (storeRow?.id != null) {
          const byProgressStoreId = await db
            .from("merchant_store_registration_progress")
            .select("*")
            .eq("parent_id", parentId)
            .eq("store_id", storeRow.id)
            .neq("registration_status", "COMPLETED")
            .order("updated_at", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          assignProgressError(byProgressStoreId.error);
          if (byProgressStoreId.data) progress = byProgressStoreId.data as ProgressRow;
        }
      }

      if (!progress) {
        const byJsonPath = await db
          .from("merchant_store_registration_progress")
          .select("*")
          .eq("parent_id", parentId)
          .neq("registration_status", "COMPLETED")
          .eq("form_data->step_store->>storePublicId", storePublicId)
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        assignProgressError(byJsonPath.error);
        if (byJsonPath.data) progress = byJsonPath.data as ProgressRow;
      }

      if (!progress) {
        const recent = await db
          .from("merchant_store_registration_progress")
          .select("*")
          .eq("parent_id", parentId)
          .neq("registration_status", "COMPLETED")
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(40);
        assignProgressError(recent.error);
        const rows = recent.data ?? [];
        const fdMatch = rows.find((row) => {
          const fd = row.form_data as ProgressFormData | null | undefined;
          const pid = fd?.step_store?.storePublicId;
          return typeof pid === "string" && pid === storePublicId;
        });
        if (fdMatch) progress = fdMatch as ProgressRow;
      }

      if (progress) err = null;
    } else {
      const byParent = await db
        .from("merchant_store_registration_progress")
        .select("*")
        .eq("parent_id", parentId)
        .neq("registration_status", "COMPLETED")
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      assignProgressError(byParent.error);
      if (byParent.data) progress = byParent.data as ProgressRow;
    }

    // Do NOT mint orphan GMMC ids into progress without a merchant_stores row.
    // Store public IDs are created in PUT via insertStoreAfterStep1.

    if (err) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch progress" },
        { status: 500 }
      );
    }

    if (!progress) {
      return NextResponse.json({ success: true, progress: null });
    }

    let stepStore = (progress.form_data as any)?.step_store;
    let progressStoreDbId = stepStore?.storeDbId ? Number(stepStore.storeDbId) : null;
    let progressStorePublicId = stepStore?.storePublicId;

    if ((!progressStorePublicId || !progressStoreDbId) && (progress as any).store_id) {
      const storeInternalId = Number((progress as any).store_id);
      if (Number.isFinite(storeInternalId)) {
        const { data: storeRow } = await db
          .from("merchant_stores")
          .select("id, store_id")
          .eq("id", storeInternalId)
          .maybeSingle();
        if (storeRow) {
          stepStore = { storeDbId: storeRow.id, storePublicId: storeRow.store_id };
          progressStoreDbId = storeRow.id as number;
          progressStorePublicId = storeRow.store_id as string;
          const formData = ((progress.form_data as Record<string, unknown>) || {}) as Record<string, unknown>;
          progress = { ...progress, form_data: { ...formData, step_store: stepStore } } as ProgressRow;
        }
      }
    }
    // Resolve internal store id when only public GMMC… id is in form_data (common for AM-created stores)
    if (!progressStoreDbId && progressStorePublicId) {
      const { data: rowByPublic } = await db
        .from("merchant_stores")
        .select("id, store_id")
        .eq("store_id", progressStorePublicId)
        .maybeSingle();
      if (rowByPublic) {
        stepStore = { ...(typeof stepStore === "object" && stepStore ? stepStore : {}), storeDbId: rowByPublic.id, storePublicId: rowByPublic.store_id };
        progressStoreDbId = rowByPublic.id as number;
        progressStorePublicId = rowByPublic.store_id as string;
        const formData = ((progress.form_data as Record<string, unknown>) || {}) as Record<string, unknown>;
        progress = { ...progress, form_data: { ...formData, step_store: stepStore } } as ProgressRow;
      }
    }
    if (progressStoreDbId) {
      const { data: storeExists } = await db
        .from("merchant_stores")
        .select("id")
        .eq("id", progressStoreDbId)
        .maybeSingle();
      if (!storeExists) {
        return NextResponse.json({ success: true, progress: null });
      }

      // Enrich form_data.step1 from merchant_stores so fields like owner_full_name load when store was created from AM (progress may not have step1 saved yet)
      const { data: storeRow } = await db
        .from("merchant_stores")
        .select("store_name, owner_full_name, store_display_name, store_description, store_email, store_phones, store_type, custom_store_type")
        .eq("id", progressStoreDbId)
        .maybeSingle();
      if (storeRow) {
        const formData = (progress.form_data || {}) as Record<string, unknown>;
        const step1 = (formData.step1 || {}) as Record<string, unknown>;
        const strOrEmpty = (v: unknown) => (typeof v === "string" ? v.trim() : v != null ? String(v).trim() : "");
        const preferNonEmptyDb = (dbVal: unknown, progVal: unknown): string => {
          const d = strOrEmpty(dbVal);
          if (d) return typeof dbVal === "string" ? dbVal.trim() : String(dbVal).trim();
          const p = strOrEmpty(progVal);
          return p;
        };
        const mergedStep1 = {
          ...step1,
          store_name: storeRow.store_name ?? step1.store_name,
          owner_full_name: preferNonEmptyDb(storeRow.owner_full_name, step1.owner_full_name),
          store_display_name: storeRow.store_display_name ?? step1.store_display_name,
          store_description: storeRow.store_description ?? step1.store_description,
          store_email: storeRow.store_email ?? step1.store_email,
          store_phones: storeRow.store_phones ?? step1.store_phones,
          store_type: storeRow.store_type ?? step1.store_type,
          custom_store_type: storeRow.custom_store_type ?? step1.custom_store_type,
        };
        progress = { ...progress, form_data: { ...formData, step1: mergedStep1 } } as ProgressRow;
      }
    }

    // Merge merchant_store_documents into form_data.step4 so UI shows saved doc URLs after refresh
    const storeDbId = progressStoreDbId;
    if (storeDbId) {
      const { data: docRow } = await db
        .from("merchant_store_documents")
        .select("*")
        .eq("store_id", storeDbId)
        .maybeSingle();
      if (docRow) {
        const formData = (progress.form_data || {}) as Record<string, unknown>;
        const step4 = (formData.step4 || {}) as Record<string, unknown>;
        // Use DB as source of truth for URLs: null in DB means no attachment (don't fall back to progress row)
        const rawPan = docRow.pan_document_url ?? null;
        const rawAadharFront = docRow.aadhaar_document_url ?? null;
        const rawAadharBack = (docRow.aadhaar_document_metadata as any)?.back_url ?? null;
        const rawGst = docRow.gst_document_url ?? null;
        const rawFssai = docRow.fssai_document_url ?? null;
        const rawDrug = docRow.drug_license_document_url ?? null;
        const rawPharmacist = docRow.pharmacist_certificate_document_url ?? null;
        const rawPharmacyCouncil = docRow.pharmacy_council_registration_document_url ?? null;
        const rawTrade = docRow.trade_license_document_url ?? null;
        const rawShopEst = docRow.shop_establishment_document_url ?? null;
        const rawUdyam = docRow.udyam_document_url ?? null;
        const rawOther = docRow.other_document_url ?? null;
        const [
          pan_image_url,
          aadhar_front_url,
          aadhar_back_url,
          gst_image_url,
          fssai_image_url,
          drug_license_image_url,
          pharmacist_certificate_url,
          pharmacy_council_registration_url,
          trade_license_document_url,
          shop_establishment_document_url,
          udyam_document_url,
          other_document_file_url,
        ] = await Promise.all([
          toFreshSignedUrl(rawPan),
          toFreshSignedUrl(rawAadharFront),
          toFreshSignedUrl(rawAadharBack),
          toFreshSignedUrl(rawGst),
          toFreshSignedUrl(rawFssai),
          toFreshSignedUrl(rawDrug),
          toFreshSignedUrl(rawPharmacist),
          toFreshSignedUrl(rawPharmacyCouncil),
          toFreshSignedUrl(rawTrade),
          toFreshSignedUrl(rawShopEst),
          toFreshSignedUrl(rawUdyam),
          toFreshSignedUrl(rawOther),
        ]);
        const mergedStep4 = {
          ...step4,
          pan_number: docRow.pan_document_number ?? step4.pan_number,
          pan_holder_name: docRow.pan_holder_name ?? step4.pan_holder_name,
          pan_is_verified: Boolean(docRow.pan_is_verified),
          pan_verified_at: docRow.pan_verified_at ?? null,
          pan_verification_method: docRow.pan_verification_method ?? null,
          pan_verified_details: verifiedDetailsForUi(
            Boolean(docRow.pan_is_verified),
            docRow.pan_document_metadata,
            docRow.pan_holder_name,
            asRecord(docRow.extracted_data_summary).pan,
          ),
          pan_rejection_reason: docRow.pan_rejection_reason ?? null,
          gst_rejection_reason: docRow.gst_rejection_reason ?? null,
          aadhaar_rejection_reason: docRow.aadhaar_rejection_reason ?? null,
          fssai_rejection_reason: docRow.fssai_rejection_reason ?? null,
          drug_license_rejection_reason: docRow.drug_license_rejection_reason ?? null,
          pharmacist_certificate_rejection_reason: docRow.pharmacist_certificate_rejection_reason ?? null,
          pharmacy_council_registration_rejection_reason: docRow.pharmacy_council_registration_rejection_reason ?? null,
          trade_license_rejection_reason: docRow.trade_license_rejection_reason ?? null,
          shop_establishment_rejection_reason: docRow.shop_establishment_rejection_reason ?? null,
          udyam_rejection_reason: docRow.udyam_rejection_reason ?? null,
          other_rejection_reason: docRow.other_rejection_reason ?? null,
          bank_proof_rejection_reason: docRow.bank_proof_rejection_reason ?? null,
          pan_image_url: pan_image_url ?? rawPan,
          aadhar_number: (() => {
            const raw = docRow.aadhaar_document_number ?? step4.aadhar_number;
            return raw ? maskAadhaarNumber(String(raw)) : raw;
          })(),
          aadhar_holder_name: docRow.aadhaar_holder_name ?? step4.aadhar_holder_name,
          aadhaar_is_verified: Boolean(docRow.aadhaar_is_verified),
          aadhaar_verified_at: docRow.aadhaar_verified_at ?? null,
          aadhaar_verification_method: docRow.aadhaar_verification_method ?? null,
          aadhaar_verified_details: verifiedDetailsForUi(
            Boolean(docRow.aadhaar_is_verified),
            docRow.aadhaar_document_metadata,
            docRow.aadhaar_holder_name,
            asRecord(docRow.extracted_data_summary).aadhaar,
          ),
          aadhar_front_url: aadhar_front_url ?? rawAadharFront,
          aadhar_back_url: aadhar_back_url ?? rawAadharBack,
          gst_number: docRow.gst_document_number ?? step4.gst_number,
          gst_is_verified: Boolean(docRow.gst_is_verified),
          gst_verified_at: docRow.gst_verified_at ?? null,
          gst_verification_method: docRow.gst_verification_method ?? null,
          gst_legal_business_name:
            docRow.gst_legal_business_name ??
            (step4 as { gst_legal_business_name?: string }).gst_legal_business_name ??
            null,
          gst_principal_place_of_business:
            docRow.gst_principal_place_of_business ??
            (step4 as { gst_principal_place_of_business?: string }).gst_principal_place_of_business ??
            null,
          gst_effective_registration_date:
            docRow.gst_effective_registration_date ??
            (step4 as { gst_effective_registration_date?: string }).gst_effective_registration_date ??
            null,
          gst_verified_details: (() => {
            const base = verifiedDetailsForUi(
              Boolean(docRow.gst_is_verified),
              docRow.gst_document_metadata,
              null,
              asRecord(docRow.extracted_data_summary).gstin ??
                asRecord(docRow.extracted_data_summary).gst,
            );
            if (!base) return null;
            return mergeGstFetchedIntoVerifiedDetails(base, {
              legal_business_name: docRow.gst_legal_business_name ?? null,
              principal_place_of_business: docRow.gst_principal_place_of_business ?? null,
              effective_registration_date: docRow.gst_effective_registration_date ?? null,
            });
          })(),
          gst_image_url: gst_image_url ?? rawGst,
          fssai_number: docRow.fssai_document_number ?? step4.fssai_number,
          fssai_image_url: fssai_image_url ?? rawFssai,
          fssai_expiry_date: docRow.fssai_expiry_date ?? step4.fssai_expiry_date,
          drug_license_number: docRow.drug_license_document_number ?? step4.drug_license_number,
          drug_license_image_url: drug_license_image_url ?? rawDrug,
          drug_license_expiry_date: docRow.drug_license_expiry_date ?? step4.drug_license_expiry_date,
          pharmacist_registration_number: docRow.pharmacist_certificate_document_number ?? step4.pharmacist_registration_number,
          pharmacist_certificate_url: pharmacist_certificate_url ?? rawPharmacist,
          pharmacist_expiry_date: docRow.pharmacist_certificate_expiry_date ?? step4.pharmacist_expiry_date,
          pharmacy_council_registration_url: pharmacy_council_registration_url ?? rawPharmacyCouncil,
          trade_license_number: docRow.trade_license_document_number ?? (step4 as any).trade_license_number,
          trade_license_document_url: trade_license_document_url ?? rawTrade,
          trade_license_expiry_date: docRow.trade_license_expiry_date ?? (step4 as any).trade_license_expiry_date,
          shop_establishment_number: docRow.shop_establishment_document_number ?? (step4 as any).shop_establishment_number,
          shop_establishment_document_url: shop_establishment_document_url ?? rawShopEst,
          shop_establishment_expiry_date: docRow.shop_establishment_expiry_date ?? (step4 as any).shop_establishment_expiry_date,
          udyam_number: docRow.udyam_document_number ?? (step4 as any).udyam_number,
          udyam_document_url: udyam_document_url ?? rawUdyam,
          other_document_number: docRow.other_document_number ?? step4.other_document_number,
          other_document_type: docRow.other_document_type ?? step4.other_document_type,
          other_document_name: docRow.other_document_name ?? step4.other_document_name,
          other_document_file_url: other_document_file_url ?? rawOther,
          other_document_expiry_date: docRow.other_expiry_date ?? step4.other_document_expiry_date,
          step4_rejection_details: docRow.step4_rejection_details ?? (step4 as { step4_rejection_details?: unknown }).step4_rejection_details ?? null,
        };
        // Sign bank/UPI attachment URLs (R2 private URLs require signed URLs for viewing)
        const bankData = (step4.bank || {}) as Record<string, unknown>;
        const rawBankProof = bankData.bank_proof_file_url;
        const rawUpiQr = bankData.upi_qr_screenshot_url;
        const [signedBankProof, signedUpiQr] = await Promise.all([
          toFreshSignedUrl(typeof rawBankProof === "string" ? rawBankProof : null),
          toFreshSignedUrl(typeof rawUpiQr === "string" ? rawUpiQr : null),
        ]);
        if (Object.keys(bankData).length > 0) {
          (mergedStep4 as Record<string, unknown>).bank = {
            ...bankData,
            bank_proof_file_url: signedBankProof ?? rawBankProof,
            upi_qr_screenshot_url: signedUpiQr ?? rawUpiQr,
          };
        }
        progress = { ...progress, form_data: { ...formData, step4: mergedStep4 } } as ProgressRow;
      }

      // Enrich step4.bank from merchant_store_bank_accounts so contract PDF always has bank details (e.g. after refresh on agreement/signature step)
      const { data: bankRow } = await db
        .from("merchant_store_bank_accounts")
        .select("account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, payout_method, upi_id, bank_proof_file_url, upi_qr_screenshot_url, is_verified, upi_verified, verified_at, verification_method, bank_metadata")
        .eq("store_id", storeDbId)
        .eq("is_active", true)
        .order("is_primary", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (bankRow) {
        const formData = (progress.form_data || {}) as Record<string, unknown>;
        const step4 = (formData.step4 || {}) as Record<string, unknown>;
        const [signedBankProof, signedUpiQr] = await Promise.all([
          toFreshSignedUrl(bankRow.bank_proof_file_url ?? null),
          toFreshSignedUrl(bankRow.upi_qr_screenshot_url ?? null),
        ]);
        const bankMeta = asRecord(bankRow.bank_metadata);
        const auto = asRecord(bankMeta.auto_verification);
        const upiAuto = asRecord(bankMeta.upi_auto_verification);
        const enrichedBank = {
          account_holder_name: bankRow.account_holder_name ?? "",
          account_number: bankRow.account_number ?? "",
          ifsc_code: bankRow.ifsc_code ?? "",
          bank_name: bankRow.bank_name ?? "",
          branch_name: bankRow.branch_name ?? null,
          account_type: bankRow.account_type ?? "savings",
          payout_method: bankRow.payout_method === "upi" ? "upi" : "bank",
          upi_id: bankRow.upi_id ?? "",
          bank_proof_file_url: signedBankProof ?? bankRow.bank_proof_file_url ?? null,
          upi_qr_screenshot_url: signedUpiQr ?? bankRow.upi_qr_screenshot_url ?? null,
          bank_is_verified: Boolean(
            Object.keys(asRecord(auto.verified_data)).length > 0 ||
              (Boolean(bankRow.is_verified) && Boolean(bankRow.account_number)),
          ),
          upi_verified: Boolean(bankRow.upi_verified),
          bank_verified_at: bankRow.verified_at ?? null,
          bank_verification_method: bankRow.verification_method ?? null,
          bank_verified_details: asRecord(auto.verified_data),
          upi_verified_details: asRecord(upiAuto.verified_data),
        };
        progress = { ...progress, form_data: { ...formData, step4: { ...step4, bank: enrichedBank } } } as ProgressRow;
      }

      if (!docRow && storeDbId) {
        // No documents row in DB: clear step4 doc URLs so UI reflects truth (e.g. after manual DB delete)
        const formData = (progress.form_data || {}) as Record<string, unknown>;
        const step4 = (formData.step4 || {}) as Record<string, unknown>;
        const clearedStep4 = {
          ...step4,
          pan_image_url: null,
          aadhar_front_url: null,
          aadhar_back_url: null,
          gst_image_url: null,
          fssai_image_url: null,
          drug_license_image_url: null,
          pharmacist_certificate_url: null,
          pharmacy_council_registration_url: null,
          other_document_file_url: null,
          bank: step4.bank && typeof step4.bank === "object"
            ? { ...(step4.bank as Record<string, unknown>), bank_proof_file_url: null, upi_qr_screenshot_url: null }
            : step4.bank,
        };
        progress = { ...progress, form_data: { ...formData, step4: clearedStep4 } } as ProgressRow;
      }
      const { data: menuMedia } = await db
        .from("merchant_store_media_files")
        .select(
          "id, menu_url, public_url, r2_key, source_entity, original_file_name, created_at, menu_reference_image_urls, verification_status"
        )
        .eq("store_id", storeDbId)
        .eq("media_scope", "MENU_REFERENCE")
        .eq("is_active", true)
        .order("created_at", { ascending: true });
      if (menuMedia && menuMedia.length > 0) {
        const formData = (progress.form_data || {}) as Record<string, unknown>;
        const step3 = (formData.step3 || {}) as Record<string, unknown>;
        const pdfRow = menuMedia.find((m: { source_entity?: string }) => m.source_entity === "ONBOARDING_MENU_PDF");
        const sheetRow = menuMedia.find((m: { source_entity?: string }) => m.source_entity === "ONBOARDING_MENU_SHEET");
          const imageRows = menuMedia.filter((m: { source_entity?: string }) => m.source_entity === "ONBOARDING_MENU_IMAGE");

        type MenuRow = {
          menu_url?: string | null;
          public_url?: string | null;
          r2_key?: string | null;
          original_file_name?: string | null;
          verification_status?: string | null;
        };
        const rowStoredUrl = (r: MenuRow) =>
          (r.menu_url && String(r.menu_url).trim()) || (r.public_url && String(r.public_url).trim()) || r.r2_key || null;
        let mergedStep3: Record<string, unknown>;

        if (pdfRow) {
          const r = pdfRow as MenuRow;
          const rawPdf = (rowStoredUrl(r) || step3.menuPdfUrl) as string | null;
          const signedPdf = toMenuProxyUrl(rawPdf);
          const pdfVs = String(r.verification_status ?? "PENDING").toUpperCase();
          mergedStep3 = {
            ...step3,
            menuUploadMode: "PDF",
            menuPdfUrl: signedPdf ?? rawPdf ?? step3.menuPdfUrl,
            menuPdfFileName: r.original_file_name ?? step3.menuPdfFileName ?? null,
            menuPdfVerificationStatus: pdfVs,
            menuSpreadsheetUrl: null,
            menuSpreadsheetName: null,
            menuImageUrls: [],
            menuImageNames: [],
            menuImageEntryIds: [],
            menuImageVerificationStatuses: [],
            menuUploadIds: [pdfRow.id as number],
          };
        } else if (sheetRow) {
          const r = sheetRow as MenuRow;
          const rawSheetUrl = (rowStoredUrl(r) || step3.menuSpreadsheetUrl) as string | null;
          const signedSheetUrl = toMenuProxyUrl(rawSheetUrl);
          mergedStep3 = {
            ...step3,
            menuUploadMode: "CSV",
            menuSpreadsheetUrl: signedSheetUrl ?? rawSheetUrl ?? step3.menuSpreadsheetUrl,
            menuSpreadsheetName: r.original_file_name ?? step3.menuSpreadsheetName ?? null,
            menuPdfUrl: null,
            menuPdfFileName: null,
            menuPdfVerificationStatus: null,
            menuImageUrls: [],
            menuImageNames: [],
            menuImageEntryIds: [],
            menuImageVerificationStatuses: [],
            menuUploadIds: [sheetRow.id as number],
          };
        } else if (imageRows.length > 0) {
          const withMeta = entriesWithRowMetaFromImageRows(
            imageRows as {
              id: number;
              menu_reference_image_urls?: unknown;
              menu_url?: string | null;
              public_url?: string | null;
              r2_key?: string | null;
              original_file_name?: string | null;
              verification_status?: string | null;
            }[]
          );
          const rawImageUrls = withMeta.map((x) => x.url);
          const signedImageUrls = rawImageUrls
            .map((u) => toMenuProxyUrl(u))
            .filter((u: string | null): u is string => !!u);
          const menuImageNamesResolved = withMeta.map((x, i) => {
            const fn = typeof x.file_name === "string" ? x.file_name.trim() : "";
            if (fn) return fn;
            const fromUrl = fileNameFromMenuStoredUrl(x.url);
            if (fromUrl) return fromUrl;
            return `Menu image ${i + 1}`;
          });
          const menuImageVerificationStatusesResolved = withMeta.map((x) =>
            String(x.verification_status ?? "PENDING").toUpperCase()
          );
          mergedStep3 = {
            ...step3,
            menuUploadMode: "IMAGE",
            menuImageUrls: signedImageUrls.length > 0 ? signedImageUrls : rawImageUrls,
            menuImageNames: menuImageNamesResolved,
            menuImageVerificationStatuses: menuImageVerificationStatusesResolved,
            menuUploadIds: withMeta.map((x) => x.rowId),
            menuImageEntryIds: withMeta.map((x) => x.id),
            menuSpreadsheetUrl: null,
            menuSpreadsheetName: null,
            menuPdfUrl: null,
            menuPdfFileName: null,
            menuPdfVerificationStatus: null,
          };
        } else {
          mergedStep3 = { ...step3 };
        }

        progress = { ...progress, form_data: { ...formData, step3: mergedStep3 } } as ProgressRow;
      } else if (storeDbId && (menuMedia == null || menuMedia.length === 0)) {
        // No menu files in DB: clear step3 menu URLs so UI reflects truth (e.g. after remove or manual DB delete)
        const formData = (progress.form_data || {}) as Record<string, unknown>;
        const step3 = (formData.step3 || {}) as Record<string, unknown>;
        const mergedStep3 = {
          ...step3,
          menuSpreadsheetUrl: null,
          menuSpreadsheetName: null,
          menuImageUrls: [],
          menuImageNames: [],
          menuImageEntryIds: [],
          menuImageVerificationStatuses: [],
          menuUploadIds: [],
          menuPdfUrl: null,
          menuPdfFileName: null,
          menuPdfVerificationStatus: null,
        };
        progress = { ...progress, form_data: { ...formData, step3: mergedStep3 } } as ProgressRow;
      }
    }

    const step3 = (progress.form_data as any)?.step3;
    if (
      step3 &&
      (step3.menuSpreadsheetUrl ||
        step3.menuPdfUrl ||
        (Array.isArray(step3.menuImageUrls) && step3.menuImageUrls.length > 0))
    ) {
      const signedSheet = toMenuProxyUrl(step3.menuSpreadsheetUrl || null);
      const signedPdf = toMenuProxyUrl(step3.menuPdfUrl || null);
      const signedImages = (Array.isArray(step3.menuImageUrls) ? step3.menuImageUrls : [])
        .map((u: string) => toMenuProxyUrl(u))
        .filter((u: string | null): u is string => !!u);
      const formData = (progress.form_data || {}) as Record<string, unknown>;
      const mergedStep3 = {
        ...step3,
        menuSpreadsheetUrl: signedSheet ?? step3.menuSpreadsheetUrl,
        menuPdfUrl: signedPdf ?? step3.menuPdfUrl,
        menuImageUrls: signedImages.filter(Boolean).length > 0 ? signedImages : step3.menuImageUrls,
      };
      progress = { ...progress, form_data: { ...formData, step3: mergedStep3 } } as ProgressRow;
    }

    // Sign bank/UPI URLs whenever step4.bank exists (R2 private URLs require signed URLs for viewing)
    const step4ForBank = (progress.form_data as any)?.step4;
    if (step4ForBank?.bank) {
      const bankData = step4ForBank.bank as Record<string, unknown>;
      const rawBankProof = bankData.bank_proof_file_url;
      const rawUpiQr = bankData.upi_qr_screenshot_url;
      const [signedBankProof, signedUpiQr] = await Promise.all([
        toFreshSignedUrl(typeof rawBankProof === "string" ? rawBankProof : null),
        toFreshSignedUrl(typeof rawUpiQr === "string" ? rawUpiQr : null),
      ]);
      const formData = (progress.form_data || {}) as Record<string, unknown>;
      const step4 = { ...(formData.step4 as Record<string, unknown>), bank: {
        ...bankData,
        bank_proof_file_url: signedBankProof ?? rawBankProof,
        upi_qr_screenshot_url: signedUpiQr ?? rawUpiQr,
      } };
      progress = { ...progress, form_data: { ...formData, step4 } } as ProgressRow;
    }

    // Enrich step5 from merchant_stores + operating_hours (same as step1/3/4 DB hydrate).
    if (progressStoreDbId) {
      try {
        const formData = (progress.form_data || {}) as Record<string, unknown>;
        const existingStep5 =
          formData.step5 && typeof formData.step5 === "object"
            ? (formData.step5 as Record<string, unknown>)
            : null;
        const mergedStep5 = await enrichStep5FromMerchantTables(
          db as unknown as Step5Supabase,
          progressStoreDbId,
          existingStep5,
        );
        progress = { ...progress, form_data: { ...formData, step5: mergedStep5 } } as ProgressRow;
      } catch (e) {
        console.warn("[register-store-progress] step5 enrich from merchant tables failed:", e);
      }
    }

    // Reconcile stale counters/flags for already-saved rows.
    const formDataForFlags = (progress.form_data || {}) as Record<string, unknown>;
    const reconciledFlags = buildReconciledFlags({
      existingFlags: progress,
      existingCurrentStep: Number(progress.current_step || 1),
      normalizedCurrentStep: Number(progress.current_step || 1),
      mergedFormData: formDataForFlags,
      markStepComplete: false,
    });
    const reconciledCompletedSteps = countCompletedSteps(reconciledFlags);

    // If docs aren't finished, never leave the merchant parked on step 5+.
    let reconciledCurrentStep = Number(progress.current_step || 1);
    if (
      Number.isFinite(reconciledCurrentStep) &&
      reconciledCurrentStep > 4 &&
      !isStep4ActuallyComplete(formDataForFlags)
    ) {
      reconciledCurrentStep = 4;
    }

    const needsPatch =
      progress.completed_steps !== reconciledCompletedSteps ||
      Number(progress.current_step) !== reconciledCurrentStep ||
      STEP_KEYS.some((key) => !!progress[key] !== reconciledFlags[key]);

    if (!needsPatch) {
      return NextResponse.json({ success: true, progress });
    }

    const { data: patchedProgress, error: patchError } = await db
      .from("merchant_store_registration_progress")
      .update({
        ...reconciledFlags,
        completed_steps: reconciledCompletedSteps,
        current_step: reconciledCurrentStep,
        updated_at: new Date().toISOString(),
      })
      .eq("id", progress.id)
      .select("*")
      .single();

    // Keep merchant_stores.current_onboarding_step in sync when we pull the user back to docs.
    if (
      reconciledCurrentStep === 4 &&
      Number(progress.current_step) > 4 &&
      progress.store_id
    ) {
      try {
        await db
          .from("merchant_stores")
          .update({ current_onboarding_step: 4 })
          .eq("id", progress.store_id);
      } catch {
        /* non-fatal */
      }
    }

    if (patchError) {
      return NextResponse.json({
        success: true,
        progress: {
          ...progress,
          ...reconciledFlags,
          completed_steps: reconciledCompletedSteps,
          current_step: reconciledCurrentStep,
        },
      });
    }

    // Keep in-memory form_data enrichment (step1/step4/step5 from merchant tables).
    // DB patch only updates flags/steps — returning patchedProgress alone drops hydrated values.
    return NextResponse.json({
      success: true,
      progress: {
        ...patchedProgress,
        form_data: progress.form_data,
      },
    });
  } catch (e) {
    console.error("[register-store-progress][GET]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

/**
 * Child-store serviceability gate: resolve the store's location against the Geo &
 * coverage stack (backend /v1/geo/services, same source as customer/rider). A store may
 * only onboard where GatiMitra actually serves — "serviceable" = the area is in coverage
 * AND at least one merchant-relevant delivery service (food or parcel) is live there.
 * Fail-open: any lookup error returns checked:false so onboarding is never blocked by a
 * transient issue (parent registration is a separate flow and never reaches here).
 */
async function resolveStoreLocationServiceable(
  step2: Record<string, unknown> | undefined
): Promise<{ checked: boolean; serviceable: boolean }> {
  if (!step2) return { checked: false, serviceable: true };
  const base =
    process.env.GATIMITRA_BACKEND_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:3000";
  const pincode = typeof step2.postal_code === "string" ? step2.postal_code.trim() : "";
  const state = typeof step2.state === "string" ? step2.state.trim() : "";
  const lat = Number(step2.latitude);
  const lng = Number(step2.longitude);

  const params = new URLSearchParams();
  if (pincode) params.set("pincode", pincode);
  if (state) params.set("state", state);
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    params.set("lat", String(lat));
    params.set("lng", String(lng));
  }
  if ([...params.keys()].length === 0) return { checked: false, serviceable: true };

  try {
    const res = await fetch(`${base}/v1/geo/services?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return { checked: false, serviceable: true };
    const data = (await res.json()) as {
      ok?: boolean;
      found?: boolean;
      food?: boolean;
      parcel?: boolean;
      ride?: boolean;
    };
    if (!data?.ok) return { checked: false, serviceable: true };
    const serviceable = data.found === true && (data.food === true || data.parcel === true);
    return { checked: true, serviceable };
  } catch {
    return { checked: false, serviceable: true };
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      // Only log actual errors, not missing sessions
      if (userError.message !== 'Auth session missing!') {
        logAuthError('register-store-progress-PUT', userError);
      }
      if (shouldClearSession(userError)) {
        return NextResponse.json({ 
          success: false, 
          error: "Session invalid", 
          code: "SESSION_INVALID" 
        }, { status: 401 });
      }
      return NextResponse.json({ 
        success: false, 
        error: userError.message || "Authentication failed" 
      }, { status: 401 });
    }

    if (!user) {
      return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch (parseErr: unknown) {
      const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
      console.error("[register-store-progress][PUT] Body parse failed:", msg);
      const likelyTruncated =
        parseErr instanceof SyntaxError && /unterminated|position\s+\d+/i.test(msg);
      return NextResponse.json(
        {
          success: false,
          error: likelyTruncated
            ? "Request body too large or truncated. Save again after a refresh, or ensure image previews are not sent as base64 in progress."
            : "Invalid JSON body",
          code: likelyTruncated ? "PAYLOAD_TOO_LARGE" : "BAD_JSON",
        },
        { status: likelyTruncated ? 413 : 400 }
      );
    }

    const preferredParentFromBody = body?.parentId ?? body?.parent_id ?? null;
    const validation = await validateMerchantFromSessionPreferParent(
      {
        id: user.id,
        email: user.email ?? null,
        phone: user.phone ?? null,
      },
      preferredParentFromBody == null || preferredParentFromBody === ""
        ? null
        : (preferredParentFromBody as string | number)
    );

    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error ?? "Merchant not found",
          code: "MERCHANT_NOT_FOUND",
        },
        { status: 403 }
      );
    }

    const {
      currentStep,
      nextStep,
      markStepComplete = false,
      formDataPatch = {},
      registrationStatus = "IN_PROGRESS",
      storePublicId,
      preserveProgressPosition: preserveProgressRaw,
      signalVerificationResubmission: signalResubmitRaw,
      verificationResubmitSteps: verificationResubmitStepsRaw,
    } = body || {};

    const preserveProgressPosition =
      preserveProgressRaw === true || preserveProgressRaw === "true";
    const signalVerificationResubmission =
      signalResubmitRaw === true || signalResubmitRaw === "true";
    /** During verification-fix saves we only notify ops after explicit "done" (client sends signal); intermediate uploads must not flip partner list UI. */
    const shouldMarkVerificationResubmission =
      !preserveProgressPosition || signalVerificationResubmission;
    const effectiveMarkStepComplete = preserveProgressPosition ? false : !!markStepComplete;

    const stepNumber = Number(currentStep || 1);
    const normalizedCurrentStep = Number.isFinite(stepNumber) ? Math.min(Math.max(stepNumber, 1), 9) : 1;
    const normalizedNextStep = Number.isFinite(Number(nextStep))
      ? Math.min(Math.max(Number(nextStep), 1), 9)
      : normalizedCurrentStep;

    const db = getSupabaseAdmin();

    // Prefer resolving the store by public id, then load progress by merchant_stores.id.
    // Never trust form_data.step_store alone — stale JSON can claim another store's public id
    // (seen: progress for store 87 claiming GMMC1026 while real store is id 94).
    const bodyStorePublicIdEarly =
      typeof storePublicId === "string" && storePublicId.trim() ? storePublicId.trim() : null;
    let existing: any = null;
    let resolvedStoreDbId: number | null = null;

    if (bodyStorePublicIdEarly) {
      const { data: storeForProgress } = await db
        .from("merchant_stores")
        .select("id, store_id, parent_id")
        .eq("store_id", bodyStorePublicIdEarly)
        .maybeSingle();

      if (storeForProgress?.id) {
        if (Number(storeForProgress.parent_id) !== Number(validation.merchantParentId)) {
          return NextResponse.json(
            {
              success: false,
              error: "This store belongs to a different merchant parent. Open it from the correct parent account.",
              code: "STORE_PARENT_MISMATCH",
              storePublicId: bodyStorePublicIdEarly,
              storeParentId: storeForProgress.parent_id,
              sessionParentId: validation.merchantParentId,
            },
            { status: 403 },
          );
        }
        resolvedStoreDbId = Number(storeForProgress.id);
        const { data: progressByStoreId } = await db
          .from("merchant_store_registration_progress")
          .select("*")
          .eq("parent_id", validation.merchantParentId)
          .eq("store_id", resolvedStoreDbId)
          .neq("registration_status", "COMPLETED")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (progressByStoreId?.id) existing = progressByStoreId;
      }
    }

    if (!existing?.id && !bodyStorePublicIdEarly) {
      const existingResult = await db
        .from("merchant_store_registration_progress")
        .select("*")
        .eq("parent_id", validation.merchantParentId)
        .neq("registration_status", "COMPLETED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingResult.error) {
        return NextResponse.json({ success: false, error: "Failed to read progress" }, { status: 500 });
      }
      existing = existingResult.data;
    }

    let mergedFormData: any = deepMergeFormData(
      (existing?.form_data as Record<string, unknown>) || {},
      (formDataPatch as Record<string, unknown>) || {}
    );

    /** PUT body may carry storePublicId while form_data.step_store is empty (stale client) — required to resolve merchant_stores.id for step 5+ sync. */
    const bodyStorePublicId =
      typeof storePublicId === "string" && storePublicId.trim() ? storePublicId.trim() : null;
    if (bodyStorePublicId) {
      if (!mergedFormData.step_store || typeof mergedFormData.step_store !== "object") {
        mergedFormData.step_store = {};
      }
      const ss = mergedFormData.step_store as Record<string, unknown>;
      const existingPid = ss.storePublicId != null ? String(ss.storePublicId).trim() : "";
      if (!existingPid) ss.storePublicId = bodyStorePublicId;
    }

    let nextFlags = buildReconciledFlags({
      existingFlags: existing,
      existingCurrentStep: Number(existing?.current_step || 1),
      normalizedCurrentStep,
      mergedFormData,
      markStepComplete: effectiveMarkStepComplete,
    });
    let completedSteps = countCompletedSteps(nextFlags);

    const toPositiveDbId = (raw: unknown): number | null => {
      if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
      if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
        const n = parseInt(raw.trim(), 10);
        return n > 0 ? n : null;
      }
      return null;
    };

    const effectiveStorePublicId = (() => {
      const fromForm = mergedFormData?.step_store?.storePublicId;
      const s = fromForm != null ? String(fromForm).trim() : "";
      if (s) return s;
      return bodyStorePublicId || "";
    })();

    let stepStore: { storeDbId: number; storePublicId: string } | null = null;

    // Canonical store for this public id always wins over stale form_data.step_store.storeDbId.
    if (effectiveStorePublicId) {
      const { data: canonicalStore } = await db
        .from("merchant_stores")
        .select("id, store_id, parent_id")
        .eq("store_id", effectiveStorePublicId)
        .maybeSingle();
      if (canonicalStore?.id) {
        if (Number(canonicalStore.parent_id) !== Number(validation.merchantParentId)) {
          return NextResponse.json(
            {
              success: false,
              error: "This store belongs to a different merchant parent.",
              code: "STORE_PARENT_MISMATCH",
            },
            { status: 403 },
          );
        }
        const rid = toPositiveDbId(canonicalStore.id);
        if (rid) {
          resolvedStoreDbId = rid;
          stepStore = { storeDbId: rid, storePublicId: String(canonicalStore.store_id || effectiveStorePublicId) };
          if (!mergedFormData.step_store || typeof mergedFormData.step_store !== "object") {
            mergedFormData.step_store = {};
          }
          (mergedFormData.step_store as Record<string, unknown>).storeDbId = rid;
          (mergedFormData.step_store as Record<string, unknown>).storePublicId = stepStore.storePublicId;
        }
      }
    }

    if (!stepStore) {
      const mergedDbId =
        toPositiveDbId(mergedFormData?.step_store?.storeDbId) ?? resolvedStoreDbId;
      if (mergedDbId && effectiveStorePublicId) {
        stepStore = { storeDbId: mergedDbId, storePublicId: effectiveStorePublicId };
      }
    }

    // If we have storePublicId but no valid storeDbId, resolve from merchant_stores (e.g. after migration).
    if (effectiveStorePublicId && (!stepStore?.storeDbId || stepStore.storeDbId <= 0)) {
      const { data: storeRow } = await db
        .from("merchant_stores")
        .select("id, store_id, parent_id")
        .eq("store_id", effectiveStorePublicId)
        .eq("parent_id", validation.merchantParentId)
        .maybeSingle();
      if (storeRow) {
        const rid = toPositiveDbId(storeRow.id);
        const sid = String(storeRow.store_id || effectiveStorePublicId);
        if (rid) {
          stepStore = { storeDbId: rid, storePublicId: sid };
          if (!mergedFormData.step_store) mergedFormData.step_store = {};
          (mergedFormData.step_store as Record<string, unknown>).storeDbId = rid;
          (mergedFormData.step_store as Record<string, unknown>).storePublicId = sid;
        }
      }
    }

    // Initial query excludes COMPLETED rows; contains() can miss stale form_data. If a row already exists
    // for (parent_id, store_id), we must update it — otherwise INSERT hits unique constraint 23505.
    if (!existing?.id && stepStore?.storeDbId && stepStore.storeDbId > 0) {
      const { data: progressForStore } = await db
        .from("merchant_store_registration_progress")
        .select("*")
        .eq("parent_id", validation.merchantParentId)
        .eq("store_id", stepStore.storeDbId)
        .maybeSingle();
      if (progressForStore?.id) {
        existing = progressForStore;
        mergedFormData = deepMergeFormData(
          (progressForStore.form_data as Record<string, unknown>) || {},
          mergedFormData
        );
        if (!mergedFormData.step_store || typeof mergedFormData.step_store !== "object") {
          mergedFormData.step_store = {};
        }
        const ss = mergedFormData.step_store as Record<string, unknown>;
        ss.storeDbId = stepStore.storeDbId;
        ss.storePublicId = stepStore.storePublicId;
        nextFlags = buildReconciledFlags({
          existingFlags: existing,
          existingCurrentStep: Number(existing?.current_step || 1),
          normalizedCurrentStep,
          mergedFormData,
          markStepComplete: effectiveMarkStepComplete,
        });
        completedSteps = countCompletedSteps(nextFlags);
      }
    }

    const clampOnboardingStep = (n: number) =>
      Math.min(Math.max(Math.floor(n), 1), 9);

    const finalSubmitted =
      typeof mergedFormData?.final === "object" &&
      mergedFormData.final != null &&
      (mergedFormData.final as { submitted?: boolean }).submitted === true;

    let storeAlreadySubmitted = false;
    if (stepStore?.storeDbId && stepStore.storeDbId > 0) {
      const { data: storeStatusRow } = await db
        .from("merchant_stores")
        .select("onboarding_completed, approval_status")
        .eq("id", stepStore.storeDbId)
        .maybeSingle();
      const approval = String(storeStatusRow?.approval_status || "").toUpperCase();
      storeAlreadySubmitted =
        storeStatusRow?.onboarding_completed === true ||
        ["SUBMITTED", "UNDER_VERIFICATION", "PENDING_VERIFICATION", "APPROVED"].includes(approval);
    }

    // After /api/register-store succeeds, never re-run draft upsert (it resets SUBMITTED → DRAFT).
    // BUT: still persist form_data patches (esp. step5) onto an IN_PROGRESS progress row —
    // otherwise Save & Continue returns 200 while merchant_stores / form_data.step5 stay empty.
    if (finalSubmitted || storeAlreadySubmitted || registrationStatus === "COMPLETED") {
      const patchKeys = Object.keys((formDataPatch as Record<string, unknown>) || {});
      const canPatchProgress =
        !!existing?.id &&
        String(existing.registration_status || "").toUpperCase() !== "COMPLETED" &&
        patchKeys.length > 0;
      if (canPatchProgress) {
        const closedMerged = deepMergeFormData(
          (existing.form_data as Record<string, unknown>) || {},
          (formDataPatch as Record<string, unknown>) || {},
        );
        if (stepStore?.storeDbId && closedMerged.step5 && typeof closedMerged.step5 === "object") {
          try {
            await syncMerchantStoreFromStep5(
              db as unknown as Step5Supabase,
              stepStore.storeDbId,
              closedMerged.step5 as Record<string, unknown>,
              Number(existing.current_step) || normalizedCurrentStep,
            );
          } catch (e) {
            console.error("[register-store-progress] closed-store step5 sync failed:", e);
          }
        }
        const { data: patchedClosed, error: patchClosedErr } = await db
          .from("merchant_store_registration_progress")
          .update({
            form_data: closedMerged,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (patchClosedErr) {
          console.error("[register-store-progress] closed-store form_data patch failed:", patchClosedErr);
        } else {
          return NextResponse.json({
            success: true,
            progress: patchedClosed,
            storeOnboardingClosed: true,
            formDataPatched: true,
          });
        }
      }
      return NextResponse.json({
        success: true,
        progress: existing ?? null,
        storeOnboardingClosed: true,
      });
    }

    let progressStepForPersistence = normalizedNextStep;
    if (preserveProgressPosition) {
      const fromProgress =
        existing?.id != null ? Number(existing.current_step) : NaN;
      if (Number.isFinite(fromProgress)) {
        progressStepForPersistence = clampOnboardingStep(fromProgress);
      } else {
        const dbStoreId =
          stepStore?.storeDbId && stepStore.storeDbId > 0
            ? stepStore.storeDbId
            : toPositiveDbId(existing?.store_id);
        if (dbStoreId != null && dbStoreId > 0) {
          const { data: storeProgressRow } = await db
            .from("merchant_stores")
            .select("current_onboarding_step")
            .eq("id", dbStoreId)
            .maybeSingle();
          const fromStore = Number(storeProgressRow?.current_onboarding_step);
          if (Number.isFinite(fromStore)) {
            progressStepForPersistence = clampOnboardingStep(fromStore);
          }
        }
      }
    }

    // Don't advance past documents until required sections are actually done.
    if (
      progressStepForPersistence > 4 &&
      !isStep4ActuallyComplete(mergedFormData)
    ) {
      progressStepForPersistence = 4;
      nextFlags.step_4_completed = false;
      completedSteps = countCompletedSteps(nextFlags);
    }

    // When step 1 data exists: ensure we have a store ID and a merchant_stores row (data in DB).
    // Create/update store row whenever step1 data is present, not just when step_1_completed flag is set.
    console.log("[register-store-progress] Checking step1 store creation:", {
      normalizedCurrentStep,
      hasStep1Data: !!mergedFormData?.step1,
      step1Keys: mergedFormData?.step1 ? Object.keys(mergedFormData.step1) : [],
      stepStoreDbId: stepStore?.storeDbId,
      stepStorePublicId: stepStore?.storePublicId,
    });
    
    if (normalizedCurrentStep >= 1 && mergedFormData?.step1) {
      const existingPublicId = mergedFormData?.step_store?.storePublicId;
      
      // CRITICAL: Verify store exists in DB for this parent, and public id matches (avoid phantom GMMC ids).
      let storeExistsInDb = false;
      let verifiedPublicId: string | null = null;
      if (stepStore?.storeDbId && stepStore.storeDbId > 0) {
        const { data: verifyStore } = await db
          .from("merchant_stores")
          .select("id, store_id, parent_id")
          .eq("id", stepStore.storeDbId)
          .maybeSingle();
        const parentOk =
          verifyStore != null &&
          Number(verifyStore.parent_id) === Number(validation.merchantParentId);
        const publicOk =
          !effectiveStorePublicId ||
          !verifyStore?.store_id ||
          String(verifyStore.store_id) === effectiveStorePublicId;
        storeExistsInDb = !!(verifyStore && parentOk && publicOk);
        verifiedPublicId = verifyStore?.store_id ? String(verifyStore.store_id) : null;
        console.log("[register-store-progress] Store existence check:", {
          stepStoreDbId: stepStore.storeDbId,
          storeExistsInDb,
          parentOk,
          publicOk,
          foundStoreId: verifyStore?.store_id,
          expectedPublicId: effectiveStorePublicId || null,
        });
        // If DB has a real public id but form_data drifted, align to DB.
        if (storeExistsInDb && verifiedPublicId) {
          if (!mergedFormData.step_store) mergedFormData.step_store = {};
          mergedFormData.step_store.storeDbId = stepStore.storeDbId;
          mergedFormData.step_store.storePublicId = verifiedPublicId;
          stepStore = { storeDbId: stepStore.storeDbId, storePublicId: verifiedPublicId };
        } else if (verifyStore && (!parentOk || !publicOk)) {
          // Stale / mismatched ids — force a fresh insert for this onboarding.
          stepStore = null;
          if (mergedFormData.step_store) {
            delete (mergedFormData.step_store as Record<string, unknown>).storeDbId;
          }
        }
      }
      
      if (!stepStore?.storeDbId || stepStore.storeDbId <= 0 || !storeExistsInDb) {
        try {
          const storeIdToUse =
            typeof existingPublicId === "string" && existingPublicId.trim()
              ? existingPublicId.trim()
              : await generateStorePublicId(db);

          // If this public id already exists under another parent, mint a new one.
          let finalStoreId = storeIdToUse;
          {
            const { data: collision } = await db
              .from("merchant_stores")
              .select("id, parent_id, store_id")
              .eq("store_id", finalStoreId)
              .maybeSingle();
            if (
              collision &&
              Number(collision.parent_id) !== Number(validation.merchantParentId)
            ) {
              finalStoreId = await generateStorePublicId(db);
            } else if (
              collision &&
              Number(collision.parent_id) === Number(validation.merchantParentId)
            ) {
              // Same parent already has this store — reuse it.
              if (!mergedFormData.step_store) mergedFormData.step_store = {};
              mergedFormData.step_store.storeDbId = collision.id;
              mergedFormData.step_store.storePublicId = collision.store_id;
              stepStore = {
                storeDbId: collision.id as number,
                storePublicId: String(collision.store_id),
              };
              storeExistsInDb = true;
            }
          }

          if (!storeExistsInDb) {
            if (!mergedFormData.step_store) mergedFormData.step_store = {};
            mergedFormData.step_store.storePublicId = finalStoreId;

            // Extract only step1 fields (exclude step2 location fields)
            const step1Only = {
              store_name: mergedFormData.step1.store_name,
              owner_full_name: mergedFormData.step1.owner_full_name,
              store_display_name: mergedFormData.step1.store_display_name,
              legal_business_name: mergedFormData.step1.legal_business_name,
              store_type: mergedFormData.step1.store_type,
              custom_store_type: mergedFormData.step1.custom_store_type,
              store_email: mergedFormData.step1.store_email,
              store_phones: mergedFormData.step1.store_phones,
              store_description: mergedFormData.step1.store_description,
            };

            console.log("[register-store-progress] Calling insertStoreAfterStep1:", {
              parentId: validation.merchantParentId,
              storeIdToUse: finalStoreId,
              hasStep1: !!step1Only,
              step1OnlyKeys: Object.keys(step1Only),
            });
            
            const inserted = await insertStoreAfterStep1(db, {
              parentId: validation.merchantParentId,
              step1: step1Only,
              generatedStoreId: finalStoreId,
            });
            
            console.log("[register-store-progress] Store created successfully:", inserted);
            mergedFormData.step_store.storeDbId = inserted.storeDbId;
            mergedFormData.step_store.storePublicId = inserted.storePublicId;
            stepStore = { storeDbId: inserted.storeDbId, storePublicId: inserted.storePublicId };
          }
        } catch (error) {
          console.error("Failed to ensure store row:", error);
          const message =
            error instanceof Error
              ? error.message
              : "Failed to create store. Please check required fields and try again.";
          return NextResponse.json(
            { success: false, error: message, code: "STORE_CREATE_FAILED" },
            { status: 500 }
          );
        }
      } else if (stepStore.storeDbId > 0 && storeExistsInDb && mergedFormData?.step1) {
        // If store already exists but step1 data is being updated, update the store row with step1 data only.
        try {
          const step1 = mergedFormData.step1 as Record<string, unknown>;
          const updatePayload: Record<string, unknown> = {
            store_name: step1.store_name || null,
            owner_full_name: step1.owner_full_name && String(step1.owner_full_name).trim() ? String(step1.owner_full_name).trim() : null,
            store_display_name: step1.store_display_name || null,
            store_description: step1.store_description || null,
            store_type: toEnumStoreType(step1.store_type as string) || "RESTAURANT",
            custom_store_type: step1.custom_store_type && String(step1.custom_store_type).trim() ? String(step1.custom_store_type).trim() : null,
            store_email: step1.store_email || "",
            store_phones: Array.isArray(step1.store_phones) ? step1.store_phones : [],
            updated_at: new Date().toISOString(),
          };
          
          console.log("[register-store-progress] Updating existing store with step1 data:", {
            storeDbId: stepStore.storeDbId,
            step1Fields: Object.keys(updatePayload),
          });
          
          const { error: step1UpdateErr } = await db
            .from("merchant_stores")
            .update(updatePayload)
            .eq("id", stepStore.storeDbId);
          if (step1UpdateErr) {
            throw new Error(step1UpdateErr.message);
          }
        } catch (updateError) {
          console.error("Failed to update store row with step1 data:", updateError);
          const message =
            updateError instanceof Error
              ? updateError.message
              : "Failed to update store details.";
          return NextResponse.json(
            { success: false, error: message, code: "STORE_UPDATE_FAILED" },
            { status: 500 }
          );
        }
      }
    }

    // Verification-fix saves must not re-run draft upsert — it forces DRAFT + onboarding_completed:false.
    if (normalizedCurrentStep >= 2 && !preserveProgressPosition) {
      // Serviceability gate — block committing a child store at a non-serviceable location.
      const step2Loc = mergedFormData?.step2 as Record<string, unknown> | undefined;
      if (
        step2Loc &&
        (step2Loc.postal_code ||
          step2Loc.state ||
          (step2Loc.latitude != null && step2Loc.longitude != null))
      ) {
        const svc = await resolveStoreLocationServiceable(step2Loc);
        if (svc.checked && !svc.serviceable) {
          return NextResponse.json(
            {
              success: false,
              error:
                "This location isn't in a serviceable area yet. Store onboarding will open here once GatiMitra launches services in this area.",
              code: "LOCATION_NOT_SERVICEABLE",
            },
            { status: 422 }
          );
        }
      }
      try {
        const draftResult = await upsertStoreDraft(db, {
          parentId: validation.merchantParentId,
          step1: mergedFormData?.step1,
          step2: mergedFormData?.step2,
          existingStoreDbId: stepStore?.storeDbId,
          nextStep: progressStepForPersistence,
        });
        if (draftResult) {
          stepStore = draftResult;
          mergedFormData.step_store = {
            storeDbId: stepStore.storeDbId,
            storePublicId: stepStore.storePublicId,
          };
        } else if (mergedFormData?.step1 && mergedFormData?.step2) {
          // step2 address present but upsert returned null — do not continue with phantom progress
          return NextResponse.json(
            {
              success: false,
              error:
                "Could not save store address to merchant_stores. Please complete Step 1–2 fields and try again.",
              code: "STORE_DRAFT_UPSERT_FAILED",
            },
            { status: 500 }
          );
        }
      } catch (draftErr: unknown) {
        console.error("[register-store-progress] upsertStoreDraft failed:", draftErr);
        const message =
          draftErr instanceof Error
            ? draftErr.message
            : "Failed to save store draft to merchant_stores.";
        return NextResponse.json(
          { success: false, error: message, code: "STORE_DRAFT_UPSERT_FAILED" },
          { status: 500 }
        );
      }
    }

    // Hard gate: once step1 is in the payload, progress must point at a real merchant_stores row.
    if (mergedFormData?.step1) {
      const gateDbId = stepStore?.storeDbId;
      const gatePublicId = stepStore?.storePublicId;
      if (!gateDbId || gateDbId <= 0 || !gatePublicId) {
        return NextResponse.json(
          {
            success: false,
            error: "Store was not created in the database. Please try Save & Continue again.",
            code: "STORE_MISSING_AFTER_STEP1",
          },
          { status: 500 }
        );
      }
      const { data: gateRow } = await db
        .from("merchant_stores")
        .select("id, store_id, parent_id")
        .eq("id", gateDbId)
        .maybeSingle();
      if (
        !gateRow ||
        Number(gateRow.parent_id) !== Number(validation.merchantParentId) ||
        String(gateRow.store_id) !== String(gatePublicId)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Store draft could not be verified in merchant_stores. Please try again.",
            code: "STORE_VERIFY_FAILED",
          },
          { status: 500 }
        );
      }
    }

    // Only sync menu media when this request actually sent step3 data (e.g. menu CSV/images).
    // When saving step4 (documents) we must not touch menu media or we delete the CSV.
    const patchHasStep3 = (formDataPatch as Record<string, unknown>)?.step3 !== undefined;
    if (stepStore?.storeDbId && patchHasStep3 && mergedFormData?.step3) {
      const menuMode = (mergedFormData.step3 as { menuUploadMode?: string }).menuUploadMode as
        | "IMAGE"
        | "CSV"
        | "PDF"
        | undefined;
      const imageUrls: string[] =
        menuMode === "CSV" || menuMode === "PDF"
          ? []
          : Array.isArray(mergedFormData.step3.menuImageUrls)
            ? mergedFormData.step3.menuImageUrls.filter(Boolean)
            : [];
      const spreadsheetUrl: string | null =
        menuMode === "IMAGE" || menuMode === "PDF"
          ? null
          : mergedFormData.step3.menuSpreadsheetUrl || null;
      const pdfUrl: string | null =
        menuMode === "PDF" ? mergedFormData.step3.menuPdfUrl || null : null;
      const step3Menu = mergedFormData.step3 as {
        menuSpreadsheetName?: string | null;
        menuImageNames?: string[] | null;
      };

      // Check if store is verified (onboarding completed and approved)
      const { data: storeData } = await db
        .from("merchant_stores")
        .select("id, onboarding_completed, approval_status")
        .eq("id", stepStore.storeDbId)
        .single();
      
      const isVerified = storeData?.onboarding_completed && storeData?.approval_status === "APPROVED";
      
      // Get existing menu media files
      const { data: existingRows } = await db
        .from("merchant_store_media_files")
        .select("id, r2_key, public_url, menu_url, is_active")
        .eq("store_id", stepStore.storeDbId)
        .eq("media_scope", "MENU_REFERENCE");
      
      if (isVerified) {
        // Post-verification: Keep old files, mark as inactive, add new files as active
        const updates: Promise<any>[] = [];
        
        // Mark existing menu files as inactive
        if (existingRows && existingRows.length > 0) {
          const activeRows = existingRows.filter((r) => r.is_active);
          for (const row of activeRows) {
            const q = db
              .from("merchant_store_media_files")
              .update({ is_active: false, updated_at: new Date().toISOString() })
              .eq("id", row.id);
            updates.push(Promise.resolve(q) as Promise<any>);
          }
        }
        
        // Add new files: r2_key, public_url, menu_url — all app proxy URLs
        const newMediaRows: any[] = [];
        const imgNames = Array.isArray(step3Menu.menuImageNames) ? step3Menu.menuImageNames : [];
        for (let idx = 0; idx < imageUrls.length; idx++) {
          const url = imageUrls[idx];
          const key =
            typeof url === "string"
              ? extractR2KeyFromUrl(url) || (url.includes("://") ? null : url.replace(/^\/+/, "")) || url
              : null;
          if (!key) continue;
          const proxyUrl = toStoredDocumentUrl(key) || toMenuProxyUrl(key) || url;
          const imgName =
            typeof imgNames[idx] === "string" && imgNames[idx].trim()
              ? imgNames[idx].trim()
              : `menu_image_${Date.now()}_${idx}`;
          newMediaRows.push({
            store_id: stepStore.storeDbId,
            media_scope: "MENU_REFERENCE",
            source_entity: "ONBOARDING_MENU_IMAGE",
            source_entity_id: null,
            original_file_name: imgName,
            r2_key: proxyUrl,
            public_url: proxyUrl,
            menu_url: proxyUrl,
            mime_type: "image/*",
            is_active: true,
            verification_status: "PENDING",
            uploaded_by: user.id,
          });
        }

        if (spreadsheetUrl) {
          const key =
            extractR2KeyFromUrl(spreadsheetUrl) ||
            (spreadsheetUrl.includes("://") ? null : spreadsheetUrl.replace(/^\/+/, "")) ||
            spreadsheetUrl;
          if (key) {
            const proxyUrl = toStoredDocumentUrl(key) || toMenuProxyUrl(key) || spreadsheetUrl;
            const sheetName =
              typeof step3Menu.menuSpreadsheetName === "string" && step3Menu.menuSpreadsheetName.trim()
                ? step3Menu.menuSpreadsheetName.trim()
                : "menu_spreadsheet";
            newMediaRows.push({
              store_id: stepStore.storeDbId,
              media_scope: "MENU_REFERENCE",
              source_entity: "ONBOARDING_MENU_SHEET",
              source_entity_id: null,
              original_file_name: sheetName,
              r2_key: proxyUrl,
              public_url: proxyUrl,
              menu_url: proxyUrl,
              mime_type: menuSpreadsheetMimeFromFileName(sheetName),
              is_active: true,
              verification_status: "PENDING",
              uploaded_by: user.id,
            });
          }
        }

        if (pdfUrl) {
          const key =
            extractR2KeyFromUrl(pdfUrl) || (pdfUrl.includes("://") ? null : pdfUrl.replace(/^\/+/, "")) || pdfUrl;
          if (key) {
            const proxyUrl = toStoredDocumentUrl(key) || toMenuProxyUrl(key) || pdfUrl;
            const step3meta = mergedFormData.step3 as { menuPdfFileName?: string | null };
            const pdfName =
              typeof step3meta.menuPdfFileName === "string" && step3meta.menuPdfFileName.trim()
                ? step3meta.menuPdfFileName.trim()
                : "menu.pdf";
            newMediaRows.push({
              store_id: stepStore.storeDbId,
              media_scope: "MENU_REFERENCE",
              source_entity: "ONBOARDING_MENU_PDF",
              source_entity_id: null,
              original_file_name: pdfName,
              r2_key: proxyUrl,
              public_url: proxyUrl,
              menu_url: proxyUrl,
              mime_type: "application/pdf",
              is_active: true,
              verification_status: "PENDING",
              uploaded_by: user.id,
            });
          }
        }
        
        if (newMediaRows.length > 0) {
          updates.push(Promise.resolve(db.from("merchant_store_media_files").insert(newMediaRows)) as Promise<any>);
        }
        
        if (updates.length > 0) {
          try {
            await Promise.all(updates);
          } catch (mediaError: any) {
            console.warn("[register-store-progress] media update skipped:", mediaError.message);
          }
        }
      } else {
        // During onboarding, MENU_REFERENCE rows + R2 objects are owned by POST /api/auth/register-store-menu-uploads.
        // Do not delete/re-insert here: saving progress used to wipe R2 and DB and re-insert from JSON, which removed
        // uploads after "Save & continue" when URLs were signed/expired or keys could not be resolved.
      }
    }

    if (stepStore?.storeDbId && mergedFormData?.step4) {
      const docs = mergedFormData.step4 || {};
      if (docs && typeof docs === "object" && (docs as { aadhar_number?: unknown }).aadhar_number) {
        (docs as { aadhar_number: string }).aadhar_number = maskAadhaarNumber(
          String((docs as { aadhar_number: unknown }).aadhar_number),
        );
      }
      const parseDate = (v: unknown): string | null => {
        if (v == null || v === "") return null;
        if (typeof v === "string") {
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        }
        return null;
      };
      const normalizeDocValue = (raw: unknown): string | null => {
        if (!raw || typeof raw !== "string") return null;
        const key =
          extractR2KeyFromUrl(raw) ||
          (raw.includes("://") ? null : raw.replace(/^\/+/, "")) ||
          raw;
        return toStoredDocumentUrl(key);
      };
      const [
        panDocumentUrl,
        aadhaarFrontUrl,
        aadhaarBackUrl,
        gstDocumentUrl,
        fssaiDocumentUrl,
        drugLicenseDocumentUrl,
        pharmacistCertificateUrl,
        pharmacyCouncilUrl,
        tradeLicenseUrl,
        shopEstablishmentUrl,
        udyamUrl,
        otherDocumentUrl,
      ] = [
        normalizeDocValue(docs.pan_image_url),
        normalizeDocValue(docs.aadhar_front_url),
        normalizeDocValue(docs.aadhar_back_url),
        normalizeDocValue(docs.gst_image_url),
        normalizeDocValue(docs.fssai_image_url),
        normalizeDocValue(docs.drug_license_image_url),
        normalizeDocValue(docs.pharmacist_certificate_url),
        normalizeDocValue(docs.pharmacy_council_registration_url),
        normalizeDocValue(docs.trade_license_document_url),
        normalizeDocValue(docs.shop_establishment_document_url),
        normalizeDocValue(docs.udyam_document_url),
        normalizeDocValue(docs.other_document_file_url),
      ];
      const { data: existingDocRow } = await db
        .from("merchant_store_documents")
        .select(
          "pan_document_number, pan_holder_name, gst_document_number, pan_document_url, aadhaar_document_url, aadhaar_document_metadata, gst_document_url, fssai_document_url, drug_license_document_url, pharmacist_certificate_document_url, pharmacy_council_registration_document_url, trade_license_document_url, shop_establishment_document_url, udyam_document_url, other_document_url, pan_rejection_reason, gst_rejection_reason, aadhaar_rejection_reason, fssai_rejection_reason, drug_license_rejection_reason, pharmacist_certificate_rejection_reason, pharmacy_council_registration_rejection_reason, trade_license_rejection_reason, shop_establishment_rejection_reason, udyam_rejection_reason, other_rejection_reason, step4_resubmission_flags, step4_rejection_details, pan_is_verified, gst_is_verified, aadhaar_is_verified, pan_verified_at, gst_verified_at, aadhaar_verified_at, pan_verification_method, gst_verification_method, aadhaar_verification_method, pan_document_metadata, gst_document_metadata, extracted_data_summary",
        )
        .eq("store_id", stepStore.storeDbId)
        .single();
      const existing = existingDocRow as Record<string, unknown> | null;
      const toDelete: string[] = [];
      if (existing) {
        const backUrl = (existing.aadhaar_document_metadata as Record<string, unknown>)?.back_url;
        const pairs: [string | null, unknown][] = [
          [panDocumentUrl, existing.pan_document_url],
          [aadhaarFrontUrl, existing.aadhaar_document_url],
          [aadhaarBackUrl, backUrl],
          [gstDocumentUrl, existing.gst_document_url],
          [fssaiDocumentUrl, existing.fssai_document_url],
          [drugLicenseDocumentUrl, existing.drug_license_document_url],
          [pharmacistCertificateUrl, existing.pharmacist_certificate_document_url],
          [pharmacyCouncilUrl, existing.pharmacy_council_registration_document_url],
          [tradeLicenseUrl, existing.trade_license_document_url],
          [shopEstablishmentUrl, existing.shop_establishment_document_url],
          [udyamUrl, existing.udyam_document_url],
          [otherDocumentUrl, existing.other_document_url],
        ];
        for (const [newVal, oldVal] of pairs) {
          if (!oldVal || typeof oldVal !== "string") continue;
          const oldUrl = oldVal.trim();
          if (!oldUrl) continue;

          const oldKey = extractR2KeyFromUrl(oldUrl);
          if (!oldKey) continue;

          const newUrl = typeof newVal === "string" ? newVal.trim() : "";
          const newKey =
            typeof newVal === "string"
              ? extractR2KeyFromUrl(newVal) ||
                (newVal.includes("://") ? null : newVal.replace(/^\/+/, ""))
              : null;

          const nowEmpty = !newUrl;
          const replaced = !!newUrl && (!newKey || newKey !== oldKey);

          if (nowEmpty || replaced) {
            toDelete.push(oldKey);
          }
        }
        for (const key of toDelete) {
          try {
            await deleteFromR2(key);
          } catch (e) {
            console.warn("[register-store-progress] R2 delete failed for", key, e);
          }
        }
      }
      const docRow: any = {
        store_id: stepStore.storeDbId,
        pan_document_number: docs.pan_number || null,
        pan_document_url: panDocumentUrl || null,
        pan_document_name: docs.pan_image?.name || (docs.pan_image_url ? "pan" : null) || null,
        pan_holder_name: docs.pan_holder_name || null,
        aadhaar_document_number: docs.aadhar_number
          ? maskAadhaarNumber(String(docs.aadhar_number))
          : null,
        aadhaar_document_url: aadhaarFrontUrl || null,
        aadhaar_document_name: docs.aadhar_front?.name || (docs.aadhar_front_url ? "aadhaar_front" : null) || null,
        aadhaar_holder_name: docs.aadhar_holder_name || null,
        aadhaar_document_metadata: aadhaarBackUrl != null ? { back_url: aadhaarBackUrl } : {},
        gst_document_number: docs.gst_number || null,
        gst_document_url: gstDocumentUrl || null,
        gst_document_name: docs.gst_image?.name || (docs.gst_image_url ? "gst" : null) || null,
        gst_legal_business_name:
          (docs as { gst_legal_business_name?: string }).gst_legal_business_name?.trim() || null,
        gst_principal_place_of_business:
          (docs as { gst_principal_place_of_business?: string }).gst_principal_place_of_business?.trim() ||
          null,
        gst_effective_registration_date:
          (docs as { gst_effective_registration_date?: string }).gst_effective_registration_date?.trim() ||
          null,
        fssai_document_number: docs.fssai_number || null,
        fssai_document_url: fssaiDocumentUrl || null,
        fssai_document_name: docs.fssai_image?.name || (docs.fssai_image_url ? "fssai" : null) || null,
        fssai_expiry_date: parseDate(docs.fssai_expiry_date),
        drug_license_document_number: docs.drug_license_number || null,
        drug_license_document_url: drugLicenseDocumentUrl || null,
        drug_license_document_name:
          docs.drug_license_image?.name || (docs.drug_license_image_url ? "drug_license" : null) || null,
        drug_license_expiry_date: parseDate(docs.drug_license_expiry_date),
        pharmacist_certificate_document_number: docs.pharmacist_registration_number || null,
        pharmacist_certificate_document_url: pharmacistCertificateUrl || null,
        pharmacist_certificate_document_name:
          docs.pharmacist_certificate?.name || (docs.pharmacist_certificate_url ? "pharmacist" : null) || null,
        pharmacist_certificate_expiry_date: parseDate(docs.pharmacist_expiry_date),
        pharmacy_council_registration_document_url: pharmacyCouncilUrl || null,
        pharmacy_council_registration_document_name:
          (docs.pharmacy_council_registration?.name ??
            (docs.pharmacy_council_registration_url ? "pharmacy_council" : null)) || null,
        trade_license_document_number: docs.trade_license_number || null,
        trade_license_document_url: tradeLicenseUrl || null,
        trade_license_document_name:
          docs.trade_license_document?.name || (docs.trade_license_document_url ? "trade_license" : null) || null,
        trade_license_expiry_date: parseDate(docs.trade_license_expiry_date),
        shop_establishment_document_number: docs.shop_establishment_number || null,
        shop_establishment_document_url: shopEstablishmentUrl || null,
        shop_establishment_document_name:
          docs.shop_establishment_document?.name || (docs.shop_establishment_document_url ? "shop_establishment" : null) || null,
        shop_establishment_expiry_date: parseDate(docs.shop_establishment_expiry_date),
        udyam_document_number: docs.udyam_number || null,
        udyam_document_url: udyamUrl || null,
        udyam_document_name:
          docs.udyam_document?.name || (docs.udyam_document_url ? "udyam" : null) || null,
        other_document_number: docs.other_document_number || null,
        other_document_url: otherDocumentUrl || null,
        other_document_name:
          docs.other_document_file?.name || (docs.other_document_file_url ? "other" : null) || null,
        other_document_type: docs.other_document_type || null,
        other_expiry_date: parseDate(docs.other_document_expiry_date),
      };

      // Reject duplicate FSSAI / Drug Licence numbers used by another store.
      try {
        const { client: pg } = await import("@/lib/drizzle");
        const fssaiDigits = String(docs.fssai_number || "").replace(/\D/g, "");
        if (fssaiDigits.length === 14) {
          const hit = (await pg`
            SELECT store_id FROM public.merchant_store_documents
             WHERE regexp_replace(coalesce(fssai_document_number, ''), '[^0-9]', '', 'g') = ${fssaiDigits}
               AND store_id <> ${stepStore.storeDbId}
             LIMIT 1
          `) as unknown as Array<{ store_id: number }>;
          if (hit.length > 0) {
            return NextResponse.json(
              {
                success: false,
                error:
                  "This FSSAI number is already registered with another store. Enter a different FSSAI licence number — duplicates are not allowed.",
                code: "DUPLICATE_FSSAI",
              },
              { status: 409 },
            );
          }
        }
        const drugNorm = String(docs.drug_license_number || "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "");
        if (drugNorm.length >= 5) {
          const hit = (await pg`
            SELECT store_id FROM public.merchant_store_documents
             WHERE upper(regexp_replace(coalesce(drug_license_document_number, ''), '\s+', '', 'g')) = ${drugNorm}
               AND store_id <> ${stepStore.storeDbId}
             LIMIT 1
          `) as unknown as Array<{ store_id: number }>;
          if (hit.length > 0) {
            return NextResponse.json(
              {
                success: false,
                error:
                  "This Drug Licence number is already registered with another store. Enter a different Drug Licence number — duplicates are not allowed.",
                code: "DUPLICATE_DRUG_LICENSE",
              },
              { status: 409 },
            );
          }
        }
      } catch (dupErr) {
        console.warn("[register-store-progress] licence duplicate check failed:", dupErr);
      }

      if (existing) {
        const t = (u: unknown) => (typeof u === "string" ? u.trim() : "");
        const hadRejection = (pfx: string) => {
          const v = existing[`${pfx}_rejection_reason`];
          return typeof v === "string" && v.trim() !== "";
        };
        let resubFlags: Record<string, unknown> =
          existing.step4_resubmission_flags &&
          typeof existing.step4_resubmission_flags === "object" &&
          existing.step4_resubmission_flags !== null
            ? { ...(existing.step4_resubmission_flags as Record<string, unknown>) }
            : {};
        let detailRoot: Record<string, unknown> =
          existing.step4_rejection_details &&
          typeof existing.step4_rejection_details === "object" &&
          existing.step4_rejection_details !== null
            ? { ...(existing.step4_rejection_details as Record<string, unknown>) }
            : {};
        const onNewFile = (newUrl: string | null, oldKey: string, pfx: string) => {
          const n = t(newUrl);
          const o = t(existing[oldKey]);
          if (!n || n === o) return;
          (docRow as Record<string, unknown>)[`${pfx}_is_verified`] = false;
          (docRow as Record<string, unknown>)[`${pfx}_verified_at`] = null;
          (docRow as Record<string, unknown>)[`${pfx}_verified_by`] = null;
          if (hadRejection(pfx)) {
            const det = rejectionDetailForDocType(detailRoot, pfx);
            if (rejectionRequiresNewFileUpload(det)) {
              resubFlags = { ...resubFlags, [pfx]: true };
            }
          } else {
            (docRow as Record<string, unknown>)[`${pfx}_rejection_reason`] = null;
          }
        };
        onNewFile(panDocumentUrl, "pan_document_url", "pan");
        onNewFile(aadhaarFrontUrl, "aadhaar_document_url", "aadhaar");
        const existingBack = (existing.aadhaar_document_metadata as Record<string, unknown> | undefined)?.back_url;
        const nb = t(aadhaarBackUrl);
        const ob = t(existingBack);
        if (nb && nb !== ob) {
          docRow.aadhaar_is_verified = false;
          docRow.aadhaar_verified_at = null;
          docRow.aadhaar_verified_by = null;
          if (hadRejection("aadhaar")) {
            const det = rejectionDetailForDocType(detailRoot, "aadhaar");
            if (rejectionRequiresNewFileUpload(det)) {
              resubFlags = { ...resubFlags, aadhaar: true };
            }
          } else {
            docRow.aadhaar_rejection_reason = null;
          }
        }
        onNewFile(gstDocumentUrl, "gst_document_url", "gst");
        onNewFile(fssaiDocumentUrl, "fssai_document_url", "fssai");
        onNewFile(drugLicenseDocumentUrl, "drug_license_document_url", "drug_license");
        onNewFile(pharmacistCertificateUrl, "pharmacist_certificate_document_url", "pharmacist_certificate");
        onNewFile(pharmacyCouncilUrl, "pharmacy_council_registration_document_url", "pharmacy_council_registration");
        onNewFile(tradeLicenseUrl, "trade_license_document_url", "trade_license");
        onNewFile(shopEstablishmentUrl, "shop_establishment_document_url", "shop_establishment");
        onNewFile(udyamUrl, "udyam_document_url", "udyam");
        onNewFile(otherDocumentUrl, "other_document_url", "other");
        for (const pfx of Object.keys(STEP4_PREFIX_WATCH_KEYS)) {
          if (!hadRejection(pfx)) continue;
          const det = rejectionDetailForDocType(detailRoot, pfx);
          if (rejectionRequiresNewFileUpload(det)) continue;
          if (!step4FieldsChangedForPrefix(pfx, existing, docRow as Record<string, unknown>)) continue;
          (docRow as Record<string, unknown>)[`${pfx}_rejection_reason`] = null;
          (docRow as Record<string, unknown>)[`${pfx}_is_verified`] = false;
          (docRow as Record<string, unknown>)[`${pfx}_verified_at`] = null;
          (docRow as Record<string, unknown>)[`${pfx}_verified_by`] = null;
          delete detailRoot[pfx];
          resubFlags = { ...resubFlags, [pfx]: false };
        }
        docRow.step4_rejection_details = detailRoot;
        docRow.step4_resubmission_flags = resubFlags;

        // Invalidate auto-verify only when the document NUMBER changes (not holder-name backfill).
        const newPanNum = t(docRow.pan_document_number).toUpperCase();
        const oldPanNum = t(existing.pan_document_number).toUpperCase();
        if (newPanNum && oldPanNum && newPanNum !== oldPanNum) {
          docRow.pan_is_verified = false;
          docRow.pan_verified_at = null;
          docRow.pan_verified_by = null;
          docRow.pan_verification_method = null;
          const panMeta = asRecord(existing.pan_document_metadata);
          if (panMeta.auto_verification) {
            const { auto_verification: _drop, ...rest } = panMeta;
            docRow.pan_document_metadata = rest;
          }
        } else if (
          docRow.pan_is_verified !== false &&
          (docs.pan_is_verified === true ||
            (Boolean(existing.pan_is_verified) && newPanNum && newPanNum === oldPanNum))
        ) {
          docRow.pan_is_verified = true;
          docRow.pan_verified_at =
            docs.pan_verified_at || existing.pan_verified_at || new Date().toISOString();
          docRow.pan_verification_method =
            docs.pan_verification_method || existing.pan_verification_method || "CASHFREE_AUTO";
          const details =
            (docs.pan_verified_details && typeof docs.pan_verified_details === "object"
              ? (docs.pan_verified_details as Record<string, unknown>)
              : null) ||
            verifiedDetailsForUi(
              true,
              existing.pan_document_metadata,
              docRow.pan_holder_name,
              asRecord(existing.extracted_data_summary).pan,
            ) ||
            {};
          docRow.pan_document_metadata = mergeAutoVerificationMetadata(
            existing.pan_document_metadata,
            {
              method: (docRow.pan_verification_method as "CASHFREE_AUTO") || "CASHFREE_AUTO",
              status: "verified",
              verified_at: String(docRow.pan_verified_at),
              verified_data: details,
              document_number: newPanNum || null,
            },
          );
          docRow.extracted_data_summary = mergeExtractedDataSummary(
            existing.extracted_data_summary,
            "pan",
            { verifiedData: details, method: docRow.pan_verification_method, status: "verified" },
          );
        }

        const newGstNum = t(docRow.gst_document_number).toUpperCase();
        const oldGstNum = t(existing.gst_document_number).toUpperCase();
        if (newGstNum && oldGstNum && newGstNum !== oldGstNum) {
          docRow.gst_is_verified = false;
          docRow.gst_verified_at = null;
          docRow.gst_verified_by = null;
          docRow.gst_verification_method = null;
          docRow.gst_legal_business_name = null;
          docRow.gst_principal_place_of_business = null;
          docRow.gst_effective_registration_date = null;
        } else if (
          docRow.gst_is_verified !== false &&
          (docs.gst_is_verified === true ||
            (Boolean(existing.gst_is_verified) && newGstNum && newGstNum === oldGstNum))
        ) {
          docRow.gst_is_verified = true;
          docRow.gst_verified_at =
            docs.gst_verified_at || existing.gst_verified_at || new Date().toISOString();
          docRow.gst_verification_method =
            docs.gst_verification_method || existing.gst_verification_method || "CASHFREE_AUTO";
          const details =
            (docs.gst_verified_details && typeof docs.gst_verified_details === "object"
              ? (docs.gst_verified_details as Record<string, unknown>)
              : null) ||
            verifiedDetailsForUi(
              true,
              existing.gst_document_metadata,
              null,
              asRecord(existing.extracted_data_summary).gstin,
            ) ||
            {};
          const gstInfo = pickGstFetchedBusinessInfo({
            ...details,
            gst_legal_business_name:
              (docs as { gst_legal_business_name?: string }).gst_legal_business_name ??
              existing.gst_legal_business_name,
            gst_principal_place_of_business:
              (docs as { gst_principal_place_of_business?: string })
                .gst_principal_place_of_business ?? existing.gst_principal_place_of_business,
            gst_effective_registration_date:
              (docs as { gst_effective_registration_date?: string })
                .gst_effective_registration_date ?? existing.gst_effective_registration_date,
          });
          if (gstInfo.legal_business_name) {
            docRow.gst_legal_business_name = gstInfo.legal_business_name;
          } else if (existing.gst_legal_business_name && !docRow.gst_legal_business_name) {
            docRow.gst_legal_business_name = existing.gst_legal_business_name;
          }
          if (gstInfo.principal_place_of_business) {
            docRow.gst_principal_place_of_business = gstInfo.principal_place_of_business;
          } else if (
            existing.gst_principal_place_of_business &&
            !docRow.gst_principal_place_of_business
          ) {
            docRow.gst_principal_place_of_business = existing.gst_principal_place_of_business;
          }
          if (gstInfo.effective_registration_date) {
            docRow.gst_effective_registration_date = gstInfo.effective_registration_date;
          } else if (
            existing.gst_effective_registration_date &&
            !docRow.gst_effective_registration_date
          ) {
            docRow.gst_effective_registration_date = existing.gst_effective_registration_date;
          }
          docRow.gst_document_metadata = mergeAutoVerificationMetadata(
            existing.gst_document_metadata,
            {
              method: (docRow.gst_verification_method as "CASHFREE_AUTO") || "CASHFREE_AUTO",
              status: "verified",
              verified_at: String(docRow.gst_verified_at),
              verified_data: mergeGstFetchedIntoVerifiedDetails(details, gstInfo),
              document_number: newGstNum || null,
            },
          );
          docRow.extracted_data_summary = mergeExtractedDataSummary(
            docRow.extracted_data_summary ?? existing.extracted_data_summary,
            "gstin",
            { verifiedData: details, method: docRow.gst_verification_method, status: "verified" },
          );
        }

        const newAadhaarNum = t(docRow.aadhaar_document_number);
        const oldAadhaarNum = t(existing.aadhaar_document_number);
        if (newAadhaarNum && oldAadhaarNum && newAadhaarNum !== oldAadhaarNum) {
          docRow.aadhaar_is_verified = false;
          docRow.aadhaar_verified_at = null;
          docRow.aadhaar_verified_by = null;
          docRow.aadhaar_verification_method = null;
        } else if (
          docRow.aadhaar_is_verified !== false &&
          (docs.aadhaar_is_verified === true ||
            (Boolean(existing.aadhaar_is_verified) && newAadhaarNum && newAadhaarNum === oldAadhaarNum))
        ) {
          docRow.aadhaar_is_verified = true;
          docRow.aadhaar_verified_at =
            docs.aadhaar_verified_at || existing.aadhaar_verified_at || new Date().toISOString();
          docRow.aadhaar_verification_method =
            docs.aadhaar_verification_method || existing.aadhaar_verification_method || "DIGILOCKER";
        }
      } else {
        // First documents row — honour client verified flags from interactive verify.
        if (docs.pan_is_verified === true) {
          docRow.pan_is_verified = true;
          docRow.pan_verified_at = docs.pan_verified_at || new Date().toISOString();
          docRow.pan_verification_method = docs.pan_verification_method || "CASHFREE_AUTO";
          const details =
            (docs.pan_verified_details && typeof docs.pan_verified_details === "object"
              ? (docs.pan_verified_details as Record<string, unknown>)
              : {}) || {};
          docRow.pan_document_metadata = mergeAutoVerificationMetadata({}, {
            method: "CASHFREE_AUTO",
            status: "verified",
            verified_at: String(docRow.pan_verified_at),
            verified_data: details,
            document_number: String(docRow.pan_document_number || "").toUpperCase() || null,
          });
          docRow.extracted_data_summary = mergeExtractedDataSummary({}, "pan", {
            verifiedData: details,
            method: docRow.pan_verification_method,
            status: "verified",
          });
        }
        if (docs.gst_is_verified === true) {
          docRow.gst_is_verified = true;
          docRow.gst_verified_at = docs.gst_verified_at || new Date().toISOString();
          docRow.gst_verification_method = docs.gst_verification_method || "CASHFREE_AUTO";
        }
        if (docs.aadhaar_is_verified === true) {
          docRow.aadhaar_is_verified = true;
          docRow.aadhaar_verified_at = docs.aadhaar_verified_at || new Date().toISOString();
          docRow.aadhaar_verification_method = docs.aadhaar_verification_method || "DIGILOCKER";
        }
      }
      try {
        await db.from("merchant_store_documents").upsert([docRow], { 
          onConflict: "store_id",
          ignoreDuplicates: false 
        });
      } catch (docError: any) {
        // If upsert fails, try update/insert approach
        console.warn("[register-store-progress] documents upsert failed, trying update:", docError);
        
        const { data: existingDoc } = await db
          .from("merchant_store_documents")
          .select("id")
          .eq("store_id", stepStore.storeDbId)
          .single();
        
        if (existingDoc) {
          // Update existing record
          await db
            .from("merchant_store_documents")
            .update(docRow)
            .eq("store_id", stepStore.storeDbId);
        } else {
          // Insert new record
          await db
            .from("merchant_store_documents")
            .insert([docRow]);
        }
      }

      const bank = docs.bank;
      const payoutMethod = bank?.payout_method === "upi" ? "upi" : "bank";
      const hasBankDetails =
        bank &&
        bank.account_number &&
        bank.ifsc_code &&
        (bank.bank_is_verified || (bank.account_holder_name && bank.bank_name));
      const hasUpiDetails =
        bank &&
        bank.upi_id &&
        (bank.upi_verified || bank.upi_qr_screenshot_url);

      /** Prior primary bank details — used to skip re-verification when unchanged. */
      let priorBankKey: string | null = null;

      if (
        (payoutMethod === "bank" && hasBankDetails) ||
        (payoutMethod === "upi" && hasUpiDetails)
      ) {
        try {
          const { data: existingBankRows } = await db
            .from("merchant_store_bank_accounts")
            .select("bank_proof_file_url, upi_qr_screenshot_url, account_number, ifsc_code")
            .eq("store_id", stepStore.storeDbId);
          priorBankKey = existingBankRows?.[0]
            ? `${String(existingBankRows[0].account_number ?? "")}|${String(existingBankRows[0].ifsc_code ?? "")}`
            : null;
          const newProofKey = bank.bank_proof_file_url
            ? (extractR2KeyFromUrl(bank.bank_proof_file_url) || (bank.bank_proof_file_url.includes("://") ? null : bank.bank_proof_file_url.replace(/^\/+/, "")))
            : null;
          const newUpiKey = bank.upi_qr_screenshot_url
            ? (extractR2KeyFromUrl(bank.upi_qr_screenshot_url) || (bank.upi_qr_screenshot_url.includes("://") ? null : bank.upi_qr_screenshot_url.replace(/^\/+/, "")))
            : null;
          for (const row of existingBankRows || []) {
            if (row.bank_proof_file_url) {
              const oldKey = extractR2KeyFromUrl(row.bank_proof_file_url);
              if (oldKey && oldKey !== newProofKey) {
                try {
                  await deleteFromR2(oldKey);
                } catch (e) {
                  console.warn("[register-store-progress] R2 delete bank_proof failed:", oldKey, e);
                }
              }
            }
            if (row.upi_qr_screenshot_url) {
              const oldKey = extractR2KeyFromUrl(row.upi_qr_screenshot_url);
              if (oldKey && oldKey !== newUpiKey) {
                try {
                  await deleteFromR2(oldKey);
                } catch (e) {
                  console.warn("[register-store-progress] R2 delete upi_qr failed:", oldKey, e);
                }
              }
            }
          }
          await db.from("merchant_store_bank_accounts").delete().eq("store_id", stepStore.storeDbId);

          const bankProofSigned = toStoredDocumentUrl(
            extractR2KeyFromUrl(bank.bank_proof_file_url) ||
              (bank.bank_proof_file_url?.includes("://")
                ? null
                : bank.bank_proof_file_url?.replace?.(/^\/+/, "")) ||
              bank.bank_proof_file_url
          );
          const upiQrSigned = toStoredDocumentUrl(
            extractR2KeyFromUrl(bank.upi_qr_screenshot_url) ||
              (bank.upi_qr_screenshot_url?.includes("://")
                ? null
                : bank.upi_qr_screenshot_url?.replace?.(/^\/+/, "")) ||
              bank.upi_qr_screenshot_url
          );
          const meta: Record<string, unknown> = {};
          if (bank.bank_verified_details && typeof bank.bank_verified_details === "object") {
            meta.auto_verification = {
              method: bank.bank_verification_method || "CASHFREE_AUTO",
              status: "verified",
              verified_at: bank.bank_verified_at || new Date().toISOString(),
              verified_data: bank.bank_verified_details,
            };
          }
          if (bank.upi_verified_details && typeof bank.upi_verified_details === "object") {
            meta.upi_auto_verification = {
              method: "CASHFREE_AUTO",
              status: "verified",
              verified_at: new Date().toISOString(),
              verified_data: bank.upi_verified_details,
            };
          }

          await db.from("merchant_store_bank_accounts").insert({
            store_id: stepStore.storeDbId,
            payout_method: payoutMethod,
            account_holder_name:
              bank.account_holder_name ||
              (payoutMethod === "upi" ? bank.upi_id || "UPI" : "Account"),
            account_number: hasBankDetails ? bank.account_number : null,
            ifsc_code: hasBankDetails ? bank.ifsc_code : null,
            bank_name: hasBankDetails
              ? bank.bank_name || (bank.bank_is_verified ? "Bank" : null)
              : null,
            branch_name: hasBankDetails ? bank.branch_name || null : null,
            account_type: hasBankDetails ? bank.account_type || null : null,
            upi_id: bank.upi_id || null,
            bank_proof_type: hasBankDetails ? bank.bank_proof_type || null : null,
            bank_proof_file_url: hasBankDetails ? bankProofSigned || null : null,
            upi_qr_screenshot_url: hasUpiDetails ? upiQrSigned || null : null,
            is_primary: true,
            is_active: true,
            is_verified: Boolean(bank.bank_is_verified || bank.upi_verified),
            upi_verified: Boolean(bank.upi_verified),
            verified_at:
              bank.bank_is_verified || bank.upi_verified
                ? bank.bank_verified_at || new Date().toISOString()
                : null,
            verification_method:
              bank.bank_is_verified || bank.upi_verified
                ? bank.bank_verification_method || "CASHFREE_AUTO"
                : bank.bank_proof_file_url || bank.upi_qr_screenshot_url
                  ? "DOCUMENT"
                  : null,
            bank_metadata: meta,
          });
        } catch (bankErr) {
          console.warn("[register-store-progress] bank/upi insert skipped:", bankErr);
        }
      }

      // Auto-verify changed doc numbers through the backend (Cashfree) per the
      // super-admin policy modes. Only fires for docs whose number actually
      // changed in this save, and skips numbers already verified for this store.
      try {
        const changed: Array<"pan" | "gstin" | "bank"> = [];
        const newPan = String(docRow.pan_document_number ?? "").trim().toUpperCase();
        const oldPan = String(existing?.pan_document_number ?? "").trim().toUpperCase();
        const panAlreadyVerified =
          Boolean(docRow.pan_is_verified ?? existing?.pan_is_verified) && newPan && newPan === oldPan;
        if (newPan && newPan !== oldPan && !panAlreadyVerified) changed.push("pan");

        const newGst = String(docRow.gst_document_number ?? "").trim().toUpperCase();
        const oldGst = String(existing?.gst_document_number ?? "").trim().toUpperCase();
        const gstAlreadyVerified =
          Boolean(docRow.gst_is_verified ?? existing?.gst_is_verified) && newGst && newGst === oldGst;
        if (newGst && newGst !== oldGst && !gstAlreadyVerified) changed.push("gstin");

        if (hasBankDetails && payoutMethod === "bank") {
          const newBankKey = `${String(bank.account_number ?? "")}|${String(bank.ifsc_code ?? "")}`;
          if (newBankKey !== priorBankKey) changed.push("bank");
        }

        if (changed.length > 0) {
          const { triggerMerchantStoreVerifications } = await import("@/lib/merchant-verification-trigger");
          void triggerMerchantStoreVerifications({ storeInternalId: stepStore.storeDbId, only: changed });
        }
      } catch (verifyErr) {
        console.warn("[register-store-progress] verification trigger failed to start:", verifyErr);
      }
    }

    if (stepStore?.storeDbId && !preserveProgressPosition) {
      await db
        .from("merchant_stores")
        .update({ current_onboarding_step: progressStepForPersistence })
        .eq("id", stepStore.storeDbId);
    }

    if (mergedFormData?.step5 && (!stepStore?.storeDbId || stepStore.storeDbId <= 0)) {
      console.warn("[register-store-progress] step5 sync skipped: could not resolve merchant_stores.id", {
        bodyStorePublicId,
        effectiveStorePublicId: effectiveStorePublicId || null,
        step_store: mergedFormData?.step_store,
      });
    }

    if (stepStore?.storeDbId && mergedFormData?.step5 && !preserveProgressPosition) {
      const s5 = mergedFormData.step5 as Record<string, unknown>;
      console.log("[register-store-progress] step5 sync start", {
        storeDbId: stepStore.storeDbId,
        patchKeys: Object.keys(s5),
        cuisine_n: Array.isArray(s5.cuisine_types) ? s5.cuisine_types.length : 0,
        has_hours: !!(s5.store_hours && typeof s5.store_hours === "object"),
        has_banner: typeof s5.banner_url === "string" && !!(s5.banner_url as string).trim(),
      });
      await syncMerchantStoreFromStep5(db as unknown as Step5Supabase, stepStore.storeDbId, s5, progressStepForPersistence);

      // Keep merchant_store_cuisines junction in sync with legacy cuisine_types text[].
      if (Object.prototype.hasOwnProperty.call(s5, "cuisine_types") && Array.isArray(s5.cuisine_types)) {
        try {
          const { upsertStoreCuisines } = await import("@/lib/cuisines");
          await upsertStoreCuisines(
            stepStore.storeDbId,
            (s5.cuisine_types as unknown[]).filter((x): x is string => typeof x === "string"),
          );
        } catch (e) {
          console.warn("[register-store-progress] merchant_store_cuisines sync failed:", e);
        }
      }

      // Only rewrite operating hours when the patch actually includes store_hours.
      // Partial feature/hours autosaves must not blank all days.
      if (!Object.prototype.hasOwnProperty.call(s5, "store_hours")) {
        // skip hours upsert
      } else {
      const hours = (s5.store_hours && typeof s5.store_hours === 'object' && !Array.isArray(s5.store_hours)
        ? s5.store_hours
        : {}) as {
        monday?: unknown;
        tuesday?: unknown;
        wednesday?: unknown;
        thursday?: unknown;
        friday?: unknown;
        saturday?: unknown;
        sunday?: unknown;
      };
      const parseMinutes = (v: string | null | undefined) => {
        if (!v) return null;
        const [h, m] = String(v).split(":").map(Number);
        if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
        return h * 60 + m;
      };
      const dayDuration = (d: any) => {
        const closed = !!d?.closed;
        if (closed) return 0;
        const s1 = parseMinutes(d?.slot1_open ?? d?.open);
        const e1 = parseMinutes(d?.slot1_close ?? d?.close);
        const s2 = parseMinutes(d?.slot2_open);
        const e2 = parseMinutes(d?.slot2_close);
        const first = s1 != null && e1 != null && e1 > s1 ? e1 - s1 : 0;
        const second = s2 != null && e2 != null && e2 > s2 ? e2 - s2 : 0;
        return first + second;
      };
      const toTimeOrNull = (v: string | null | undefined): string | null => {
        if (v == null) return null;
        const s = String(v).trim();
        return s === "" ? null : s;
      };
      const dayRow = (d: any) => {
        const closed = !!d?.closed;
        const slot1Start = closed ? null : toTimeOrNull(d?.slot1_open ?? d?.open);
        const slot1End = closed ? null : toTimeOrNull(d?.slot1_close ?? d?.close);
        const slot2Start = closed ? null : toTimeOrNull(d?.slot2_open);
        const slot2End = closed ? null : toTimeOrNull(d?.slot2_close);
        return {
          open: !!(slot1Start && slot1End),
          slot1Start,
          slot1End,
          slot2Start,
          slot2End,
          duration: dayDuration(d),
          closed,
        };
      };
      const monday = dayRow(hours.monday);
      const tuesday = dayRow(hours.tuesday);
      const wednesday = dayRow(hours.wednesday);
      const thursday = dayRow(hours.thursday);
      const friday = dayRow(hours.friday);
      const saturday = dayRow(hours.saturday);
      const sunday = dayRow(hours.sunday);
      const closedDays = ([
        ["monday", monday.closed],
        ["tuesday", tuesday.closed],
        ["wednesday", wednesday.closed],
        ["thursday", thursday.closed],
        ["friday", friday.closed],
        ["saturday", saturday.closed],
        ["sunday", sunday.closed],
      ] as const)
        .filter(([, isClosed]) => isClosed)
        .map(([day]) => day);
      const sameForAllDays =
        JSON.stringify(monday) === JSON.stringify(tuesday) &&
        JSON.stringify(monday) === JSON.stringify(wednesday) &&
        JSON.stringify(monday) === JSON.stringify(thursday) &&
        JSON.stringify(monday) === JSON.stringify(friday) &&
        JSON.stringify(monday) === JSON.stringify(saturday) &&
        JSON.stringify(monday) === JSON.stringify(sunday);
      const is24Hours = [
        monday,
        tuesday,
        wednesday,
        thursday,
        friday,
        saturday,
        sunday,
      ].every(
        (d) => !d.closed && d.slot1Start === "00:00" && d.slot1End === "23:59" && !d.slot2Start && !d.slot2End
      );
      const operatingHoursRow: any = {
        store_id: stepStore.storeDbId,
        monday_open: monday.open,
        monday_slot1_start: monday.slot1Start,
        monday_slot1_end: monday.slot1End,
        monday_slot2_start: monday.slot2Start,
        monday_slot2_end: monday.slot2End,
        monday_total_duration_minutes: monday.duration,
        tuesday_open: tuesday.open,
        tuesday_slot1_start: tuesday.slot1Start,
        tuesday_slot1_end: tuesday.slot1End,
        tuesday_slot2_start: tuesday.slot2Start,
        tuesday_slot2_end: tuesday.slot2End,
        tuesday_total_duration_minutes: tuesday.duration,
        wednesday_open: wednesday.open,
        wednesday_slot1_start: wednesday.slot1Start,
        wednesday_slot1_end: wednesday.slot1End,
        wednesday_slot2_start: wednesday.slot2Start,
        wednesday_slot2_end: wednesday.slot2End,
        wednesday_total_duration_minutes: wednesday.duration,
        thursday_open: thursday.open,
        thursday_slot1_start: thursday.slot1Start,
        thursday_slot1_end: thursday.slot1End,
        thursday_slot2_start: thursday.slot2Start,
        thursday_slot2_end: thursday.slot2End,
        thursday_total_duration_minutes: thursday.duration,
        friday_open: friday.open,
        friday_slot1_start: friday.slot1Start,
        friday_slot1_end: friday.slot1End,
        friday_slot2_start: friday.slot2Start,
        friday_slot2_end: friday.slot2End,
        friday_total_duration_minutes: friday.duration,
        saturday_open: saturday.open,
        saturday_slot1_start: saturday.slot1Start,
        saturday_slot1_end: saturday.slot1End,
        saturday_slot2_start: saturday.slot2Start,
        saturday_slot2_end: saturday.slot2End,
        saturday_total_duration_minutes: saturday.duration,
        sunday_open: sunday.open,
        sunday_slot1_start: sunday.slot1Start,
        sunday_slot1_end: sunday.slot1End,
        sunday_slot2_start: sunday.slot2Start,
        sunday_slot2_end: sunday.slot2End,
        sunday_total_duration_minutes: sunday.duration,
        same_for_all_days: sameForAllDays,
        is_24_hours: is24Hours,
        closed_days: closedDays,
      };
      try {
        await db.from("merchant_store_operating_hours").upsert([operatingHoursRow], { 
          onConflict: "store_id",
          ignoreDuplicates: false 
        });
      } catch (hoursError: any) {
        // If upsert fails due to constraint name mismatch, try update/insert approach
        console.warn("[register-store-progress] operating hours upsert failed, trying update:", hoursError);
        
        const { data: existingHours } = await db
          .from("merchant_store_operating_hours")
          .select("id")
          .eq("store_id", stepStore.storeDbId)
          .single();
        
        if (existingHours) {
          // Update existing record
          await db
            .from("merchant_store_operating_hours")
            .update(operatingHoursRow)
            .eq("store_id", stepStore.storeDbId);
        } else {
          // Insert new record
          await db
            .from("merchant_store_operating_hours")
            .insert([operatingHoursRow]);
        }
      }
      } // end store_hours present
    }

    // Guarantee form_data.step5 is present when client sent it (detect silent drop).
    const patchStep5 = (formDataPatch as Record<string, unknown> | undefined)?.step5;
    if (patchStep5 && typeof patchStep5 === "object" && !mergedFormData.step5) {
      console.error("[register-store-progress] step5 patch missing from mergedFormData — forcing merge");
      mergedFormData.step5 = patchStep5;
    }

    // When registration is already completed, the query excludes COMPLETED rows so existing can be null.
    // On step 9 success page we only need to acknowledge; avoid inserting a duplicate progress row.
    if (!existing?.id) {
      if (normalizedCurrentStep >= 9 || registrationStatus === "COMPLETED") {
        return NextResponse.json({ success: true, progress: null });
      }
    }

    const payload = {
      parent_id: validation.merchantParentId,
      store_id: stepStore?.storeDbId ?? existing?.store_id ?? resolvedStoreDbId ?? null,
      current_step: progressStepForPersistence,
      total_steps: 9,
      completed_steps: completedSteps,
      ...nextFlags,
      form_data: mergedFormData,
      registration_status: registrationStatus,
      updated_at: new Date().toISOString(),
      ...(normalizedCurrentStep >= 1 && nextFlags.step_1_completed ? { last_step_completed_at: new Date().toISOString() } : {}),
    };

    const vStepsForResubmit = ((): number[] => {
      const fromClient = Array.isArray(verificationResubmitStepsRaw)
        ? verificationResubmitStepsRaw
            .map((x: unknown) => Math.floor(Number(x)))
            .filter((n: number) => Number.isFinite(n) && n >= 1 && n <= 8)
        : [];
      if (signalVerificationResubmission && fromClient.length > 0) {
        return [...new Set(fromClient)].sort((a, b) => a - b);
      }
      let v = verificationStepsFromFormDataPatch(formDataPatch as Record<string, unknown>);
      if (signalVerificationResubmission) {
        const extra = partnerOnboardingStepToVerificationResubmitSteps(normalizedCurrentStep);
        v = [...new Set([...v, ...extra])].sort((a, b) => a - b);
      }
      return v;
    })();

    if (existing?.id) {
      const { data, error } = await db
        .from("merchant_store_registration_progress")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) {
        console.error("[register-store-progress][PUT] Progress update failed:", {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
        });
        return NextResponse.json({ success: false, error: "Failed to update progress" }, { status: 500 });
      }
      if (shouldMarkVerificationResubmission && stepStore?.storeDbId && vStepsForResubmit.length > 0) {
        await markMerchantResubmittedForRejectedSteps(db, stepStore.storeDbId, vStepsForResubmit);
      }
      return NextResponse.json({ success: true, progress: data });
    }

    const { data, error } = await db
      .from("merchant_store_registration_progress")
      .insert([payload])
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505" && payload.store_id != null) {
        const { data: rowOnConflict } = await db
          .from("merchant_store_registration_progress")
          .select("*")
          .eq("parent_id", validation.merchantParentId)
          .eq("store_id", payload.store_id)
          .maybeSingle();
        if (rowOnConflict?.id) {
          const mergedOnConflict = deepMergeFormData(
            (rowOnConflict.form_data as Record<string, unknown>) || {},
            mergedFormData
          );
          const retryPayload = { ...payload, form_data: mergedOnConflict };
          const { data: updatedRow, error: updateErr } = await db
            .from("merchant_store_registration_progress")
            .update(retryPayload)
            .eq("id", rowOnConflict.id)
            .select("*")
            .single();
          if (!updateErr && updatedRow) {
            if (shouldMarkVerificationResubmission && stepStore?.storeDbId && vStepsForResubmit.length > 0) {
              await markMerchantResubmittedForRejectedSteps(db, stepStore.storeDbId, vStepsForResubmit);
            }
            return NextResponse.json({ success: true, progress: updatedRow });
          }
        }
      }
      console.error("[register-store-progress][PUT] Progress insert failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json({ success: false, error: "Failed to create progress" }, { status: 500 });
    }

    if (shouldMarkVerificationResubmission && stepStore?.storeDbId && vStepsForResubmit.length > 0) {
      await markMerchantResubmittedForRejectedSteps(db, stepStore.storeDbId, vStepsForResubmit);
    }
    return NextResponse.json({ success: true, progress: data });
  } catch (e) {
    console.error("[register-store-progress][PUT]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

