import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";
import { logAuthError, shouldClearSession } from "@/lib/auth/auth-error-handler";
import { extractR2KeyFromUrl, deleteFromR2, toStoredDocumentUrl } from "@/lib/r2";
import { menuSpreadsheetMimeFromFileName } from "@/lib/r2-paths";
import { entriesWithRowMetaFromImageRows } from "@/lib/menu-reference-image-bundle";
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
} from "./helpers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });

    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json(
        { success: false, error: validation.error ?? "Merchant not found" },
        { status: 403 }
      );
    }

    const db = getSupabaseAdmin();
    const storePublicId = req.nextUrl.searchParams.get("storePublicId");
    const forceNew = req.nextUrl.searchParams.get("forceNew") === "1";

    if (forceNew) {
      return NextResponse.json({ success: true, progress: null });
    }

    let progress: ProgressRow | null = null;
    let err: { message?: string } | null = null;

    // First try to find by storePublicId if provided
    if (storePublicId) {
      const byStore = await db
        .from("merchant_store_registration_progress")
        .select("*")
        .eq("parent_id", validation.merchantParentId)
        .neq("registration_status", "COMPLETED")
        .contains("form_data", { step_store: { storePublicId } })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byStore.error) err = byStore.error;
      else if (byStore.data) progress = byStore.data as ProgressRow;
    }

    // If not found by storePublicId, try to find the most recent active progress for this parent
    if (!progress) {
      const byParent = await db
        .from("merchant_store_registration_progress")
        .select("*")
        .eq("parent_id", validation.merchantParentId)
        .neq("registration_status", "COMPLETED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (byParent.error) err = byParent.error;
      else if (byParent.data) progress = byParent.data as ProgressRow;
    }

    // If we found progress but no Store ID is generated yet, and step 1 is completed, generate it
    if (progress && !(progress.form_data as ProgressFormData | null | undefined)?.step_store?.storePublicId && progress.step_1_completed) {
      try {
        const generatedStoreId = await generateStorePublicId(db);
        console.log(`Generated Store ID during GET: ${generatedStoreId} for existing progress`);
        
        const updatedFormData = {
          ...((progress.form_data as any) || {}),
          step_store: {
            ...((progress.form_data as any)?.step_store || {}),
            storePublicId: generatedStoreId,
          },
        };

        // Update the progress record with the generated Store ID
        const { data: updatedProgress, error: updateError } = await db
          .from("merchant_store_registration_progress")
          .update({
            form_data: updatedFormData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", progress.id)
          .select("*")
          .single();

        if (!updateError && updatedProgress) {
          progress = updatedProgress as ProgressRow;
        }
      } catch (error) {
        console.error("Failed to generate Store ID during GET:", error);
      }
    }

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
        const mergedStep1 = {
          ...step1,
          store_name: storeRow.store_name ?? step1.store_name,
          owner_full_name: storeRow.owner_full_name ?? step1.owner_full_name,
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
          pan_image_url: pan_image_url ?? rawPan,
          aadhar_number: docRow.aadhaar_document_number ?? step4.aadhar_number,
          aadhar_holder_name: docRow.aadhaar_holder_name ?? step4.aadhar_holder_name,
          aadhar_front_url: aadhar_front_url ?? rawAadharFront,
          aadhar_back_url: aadhar_back_url ?? rawAadharBack,
          gst_number: docRow.gst_document_number ?? step4.gst_number,
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
        .select("account_holder_name, account_number, ifsc_code, bank_name, branch_name, account_type, payout_method, upi_id, bank_proof_file_url, upi_qr_screenshot_url")
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
          "id, menu_url, public_url, r2_key, source_entity, original_file_name, created_at, menu_reference_image_urls"
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
        };
        const rowStoredUrl = (r: MenuRow) =>
          (r.menu_url && String(r.menu_url).trim()) || (r.public_url && String(r.public_url).trim()) || r.r2_key || null;
        let mergedStep3: Record<string, unknown>;

        if (pdfRow) {
          const r = pdfRow as MenuRow;
          const rawPdf = (rowStoredUrl(r) || step3.menuPdfUrl) as string | null;
          const signedPdf = toMenuProxyUrl(rawPdf);
          mergedStep3 = {
            ...step3,
            menuUploadMode: "PDF",
            menuPdfUrl: signedPdf ?? rawPdf ?? step3.menuPdfUrl,
            menuPdfFileName: r.original_file_name ?? step3.menuPdfFileName ?? null,
            menuSpreadsheetUrl: null,
            menuSpreadsheetName: null,
            menuImageUrls: [],
            menuImageNames: [],
            menuImageEntryIds: [],
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
            menuImageUrls: [],
            menuImageNames: [],
            menuImageEntryIds: [],
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
            }[]
          );
          const rawImageUrls = withMeta.map((x) => x.url);
          const signedImageUrls = rawImageUrls
            .map((u) => toMenuProxyUrl(u))
            .filter((u: string | null): u is string => !!u);
          const namesFromDb = withMeta
            .map((x) => x.file_name)
            .filter((n): n is string => typeof n === "string" && !!n.trim());
          mergedStep3 = {
            ...step3,
            menuUploadMode: "IMAGE",
            menuImageUrls: signedImageUrls.length > 0 ? signedImageUrls : rawImageUrls,
            menuImageNames:
              namesFromDb.length > 0
                ? namesFromDb
                : Array.isArray(step3.menuImageNames)
                  ? step3.menuImageNames
                  : [],
            menuUploadIds: withMeta.map((x) => x.rowId),
            menuImageEntryIds: withMeta.map((x) => x.id),
            menuSpreadsheetUrl: null,
            menuSpreadsheetName: null,
            menuPdfUrl: null,
            menuPdfFileName: null,
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
          menuUploadIds: [],
          menuPdfUrl: null,
          menuPdfFileName: null,
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

    // Reconcile stale counters/flags for already-saved rows.
    const reconciledFlags = buildReconciledFlags({
      existingFlags: progress,
      existingCurrentStep: Number(progress.current_step || 1),
      normalizedCurrentStep: Number(progress.current_step || 1),
      mergedFormData: (progress.form_data || {}) as Record<string, unknown>,
      markStepComplete: false,
    });
    const reconciledCompletedSteps = countCompletedSteps(reconciledFlags);

    const needsPatch =
      progress.completed_steps !== reconciledCompletedSteps ||
      STEP_KEYS.some((key) => !!progress[key] !== reconciledFlags[key]);

    if (!needsPatch) {
      return NextResponse.json({ success: true, progress });
    }

    const { data: patchedProgress, error: patchError } = await db
      .from("merchant_store_registration_progress")
      .update({
        ...reconciledFlags,
        completed_steps: reconciledCompletedSteps,
        updated_at: new Date().toISOString(),
      })
      .eq("id", progress.id)
      .select("*")
      .single();

    if (patchError) {
      return NextResponse.json({ success: true, progress });
    }

    return NextResponse.json({ success: true, progress: patchedProgress });
  } catch (e) {
    console.error("[register-store-progress][GET]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
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

    const validation = await validateMerchantFromSession({
      id: user.id,
      email: user.email ?? null,
      phone: user.phone ?? null,
    });

    if (!validation.isValid || validation.merchantParentId == null) {
      return NextResponse.json(
        { success: false, error: validation.error ?? "Merchant not found" },
        { status: 403 }
      );
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
    const {
      currentStep,
      nextStep,
      markStepComplete = false,
      formDataPatch = {},
      registrationStatus = "IN_PROGRESS",
      storePublicId,
    } = body || {};

    const stepNumber = Number(currentStep || 1);
    const normalizedCurrentStep = Number.isFinite(stepNumber) ? Math.min(Math.max(stepNumber, 1), 9) : 1;
    const normalizedNextStep = Number.isFinite(Number(nextStep))
      ? Math.min(Math.max(Number(nextStep), 1), 9)
      : normalizedCurrentStep;

    const db = getSupabaseAdmin();
    let existingQuery = db
      .from("merchant_store_registration_progress")
      .select("*")
      .eq("parent_id", validation.merchantParentId)
      .neq("registration_status", "COMPLETED");

    if (storePublicId) {
      existingQuery = existingQuery.contains("form_data", { step_store: { storePublicId } });
    }

    const { data: existing, error: fetchError } = await existingQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ success: false, error: "Failed to read progress" }, { status: 500 });
    }

    const mergedFormData: any = deepMergeFormData(
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

    const nextFlags = buildReconciledFlags({
      existingFlags: existing,
      existingCurrentStep: Number(existing?.current_step || 1),
      normalizedCurrentStep,
      mergedFormData,
      markStepComplete: !!markStepComplete,
    });
    const completedSteps = countCompletedSteps(nextFlags);

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
    const mergedDbId = toPositiveDbId(mergedFormData?.step_store?.storeDbId);
    if (mergedDbId && effectiveStorePublicId) {
      stepStore = { storeDbId: mergedDbId, storePublicId: effectiveStorePublicId };
    }

    // If we have storePublicId but no valid storeDbId, resolve from merchant_stores (e.g. after migration).
    if (effectiveStorePublicId && (!stepStore?.storeDbId || stepStore.storeDbId <= 0)) {
      const { data: storeRow } = await db
        .from("merchant_stores")
        .select("id, store_id")
        .eq("store_id", effectiveStorePublicId)
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
      
      // CRITICAL: Verify store actually exists in database, not just in progress form_data
      let storeExistsInDb = false;
      if (stepStore?.storeDbId && stepStore.storeDbId > 0) {
        const { data: verifyStore } = await db
          .from("merchant_stores")
          .select("id, store_id")
          .eq("id", stepStore.storeDbId)
          .maybeSingle();
        storeExistsInDb = !!verifyStore;
        console.log("[register-store-progress] Store existence check:", {
          stepStoreDbId: stepStore.storeDbId,
          storeExistsInDb,
          foundStoreId: verifyStore?.store_id,
        });
      }
      
      if (!stepStore?.storeDbId || stepStore.storeDbId <= 0 || !storeExistsInDb) {
        try {
          const storeIdToUse =
            typeof existingPublicId === "string" && existingPublicId.trim()
              ? existingPublicId.trim()
              : await generateStorePublicId(db);
          if (!mergedFormData.step_store) mergedFormData.step_store = {};
          mergedFormData.step_store.storePublicId = storeIdToUse;

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
            storeIdToUse,
            hasStep1: !!step1Only,
            step1OnlyKeys: Object.keys(step1Only),
          });
          
          const inserted = await insertStoreAfterStep1(db, {
            parentId: validation.merchantParentId,
            step1: step1Only,
            generatedStoreId: storeIdToUse,
          });
          
          if (inserted) {
            console.log("[register-store-progress] Store created successfully:", inserted);
            mergedFormData.step_store.storeDbId = inserted.storeDbId;
            stepStore = { storeDbId: inserted.storeDbId, storePublicId: inserted.storePublicId };
          } else {
            console.error("[register-store-progress] insertStoreAfterStep1 returned null - store NOT created in DB!");
            return NextResponse.json(
              { success: false, error: "Failed to create store. Please check required fields and try again." },
              { status: 500 }
            );
          }
        } catch (error) {
          console.error("Failed to ensure store row:", error);
          if (!stepStore && existingPublicId)
            stepStore = { storeDbId: 0, storePublicId: String(existingPublicId) };
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
          
          await db
            .from("merchant_stores")
            .update(updatePayload)
            .eq("id", stepStore.storeDbId);
        } catch (updateError) {
          console.error("Failed to update store row with step1 data:", updateError);
        }
      }
    }

    if (normalizedCurrentStep >= 2) {
      try {
        const draftResult = await upsertStoreDraft(db, {
          parentId: validation.merchantParentId,
          step1: mergedFormData?.step1,
          step2: mergedFormData?.step2,
          existingStoreDbId: stepStore?.storeDbId,
          nextStep: normalizedNextStep,
        });
        if (draftResult) {
          stepStore = draftResult;
          mergedFormData.step_store = {
            storeDbId: stepStore.storeDbId,
            storePublicId: stepStore.storePublicId,
          };
        }
      } catch (draftErr: unknown) {
        console.warn("[register-store-progress] upsertStoreDraft failed (non-fatal):", draftErr);
        // Keep existing stepStore and continue to save progress
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
        .select("pan_document_url, aadhaar_document_url, aadhaar_document_metadata, gst_document_url, fssai_document_url, drug_license_document_url, pharmacist_certificate_document_url, pharmacy_council_registration_document_url, trade_license_document_url, shop_establishment_document_url, udyam_document_url, other_document_url")
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
        aadhaar_document_number: docs.aadhar_number || null,
        aadhaar_document_url: aadhaarFrontUrl || null,
        aadhaar_document_name: docs.aadhar_front?.name || (docs.aadhar_front_url ? "aadhaar_front" : null) || null,
        aadhaar_holder_name: docs.aadhar_holder_name || null,
        aadhaar_document_metadata: aadhaarBackUrl != null ? { back_url: aadhaarBackUrl } : {},
        gst_document_number: docs.gst_number || null,
        gst_document_url: gstDocumentUrl || null,
        gst_document_name: docs.gst_image?.name || (docs.gst_image_url ? "gst" : null) || null,
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
        bank.account_holder_name &&
        bank.account_number &&
        bank.ifsc_code &&
        bank.bank_name;
      const hasUpiDetails =
        bank &&
        payoutMethod === "upi" &&
        bank.upi_id &&
        bank.upi_qr_screenshot_url;

      if (hasBankDetails && payoutMethod === "bank") {
        try {
          const { data: existingBankRows } = await db
            .from("merchant_store_bank_accounts")
            .select("bank_proof_file_url, upi_qr_screenshot_url")
            .eq("store_id", stepStore.storeDbId);
          const newProofKey = bank.bank_proof_file_url
            ? (extractR2KeyFromUrl(bank.bank_proof_file_url) || (bank.bank_proof_file_url.includes("://") ? null : bank.bank_proof_file_url.replace(/^\/+/, "")))
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
          }
          await db.from("merchant_store_bank_accounts").delete().eq("store_id", stepStore.storeDbId);

          const bankProofSigned = toStoredDocumentUrl(
            extractR2KeyFromUrl(bank.bank_proof_file_url) ||
              (bank.bank_proof_file_url?.includes("://")
                ? null
                : bank.bank_proof_file_url?.replace?.(/^\/+/, "")) ||
              bank.bank_proof_file_url
          );
          await db.from("merchant_store_bank_accounts").insert({
            store_id: stepStore.storeDbId,
            payout_method: "bank",
            account_holder_name: bank.account_holder_name,
            account_number: bank.account_number,
            ifsc_code: bank.ifsc_code,
            bank_name: bank.bank_name,
            branch_name: bank.branch_name || null,
            account_type: bank.account_type || null,
            upi_id: null,
            bank_proof_type: bank.bank_proof_type || null,
            bank_proof_file_url: bankProofSigned || null,
            upi_qr_screenshot_url: null,
            is_primary: true,
            is_active: true,
          });
        } catch (bankErr) {
          console.warn("[register-store-progress] bank insert skipped:", bankErr);
        }
      } else if (hasUpiDetails) {
        try {
          const { data: existingUpiRows } = await db
            .from("merchant_store_bank_accounts")
            .select("bank_proof_file_url, upi_qr_screenshot_url")
            .eq("store_id", stepStore.storeDbId);
          const newUpiKey = bank.upi_qr_screenshot_url
            ? (extractR2KeyFromUrl(bank.upi_qr_screenshot_url) || (bank.upi_qr_screenshot_url.includes("://") ? null : bank.upi_qr_screenshot_url.replace(/^\/+/, "")))
            : null;
          for (const row of existingUpiRows || []) {
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

          const upiQrSigned = toStoredDocumentUrl(
            extractR2KeyFromUrl(bank.upi_qr_screenshot_url) ||
              (bank.upi_qr_screenshot_url?.includes("://")
                ? null
                : bank.upi_qr_screenshot_url?.replace?.(/^\/+/, "")) ||
              bank.upi_qr_screenshot_url
          );
          await db.from("merchant_store_bank_accounts").insert({
            store_id: stepStore.storeDbId,
            payout_method: "upi",
            account_holder_name: bank.account_holder_name || bank.upi_id || "UPI",
            account_number: "UPI",
            ifsc_code: "UPI",
            bank_name: "UPI",
            branch_name: null,
            account_type: null,
            upi_id: bank.upi_id || null,
            bank_proof_type: null,
            bank_proof_file_url: null,
            upi_qr_screenshot_url: upiQrSigned || null,
            is_primary: true,
            is_active: true,
          });
        } catch (upiErr) {
          console.warn("[register-store-progress] upi insert skipped:", upiErr);
        }
      }
    }

    if (stepStore?.storeDbId) {
      await db
        .from("merchant_stores")
        .update({ current_onboarding_step: normalizedNextStep })
        .eq("id", stepStore.storeDbId);
    }

    if (mergedFormData?.step5 && (!stepStore?.storeDbId || stepStore.storeDbId <= 0)) {
      console.warn("[register-store-progress] step5 sync skipped: could not resolve merchant_stores.id", {
        bodyStorePublicId,
        effectiveStorePublicId: effectiveStorePublicId || null,
        step_store: mergedFormData?.step_store,
      });
    }

    if (stepStore?.storeDbId && mergedFormData?.step5) {
      const s5 = mergedFormData.step5 as Record<string, unknown>;
      await syncMerchantStoreFromStep5(db, stepStore.storeDbId, s5, normalizedNextStep);

      const hours = s5.store_hours || {};
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
      store_id: stepStore?.storeDbId ?? existing?.store_id ?? null,
      current_step: normalizedNextStep,
      total_steps: 9,
      completed_steps: completedSteps,
      ...nextFlags,
      form_data: mergedFormData,
      registration_status: registrationStatus,
      updated_at: new Date().toISOString(),
      ...(normalizedCurrentStep >= 1 && nextFlags.step_1_completed ? { last_step_completed_at: new Date().toISOString() } : {}),
    };

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
      return NextResponse.json({ success: true, progress: data });
    }

    const { data, error } = await db
      .from("merchant_store_registration_progress")
      .insert([payload])
      .select("*")
      .single();

    if (error) {
      console.error("[register-store-progress][PUT] Progress insert failed:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      return NextResponse.json({ success: false, error: "Failed to create progress" }, { status: 500 });
    }

    return NextResponse.json({ success: true, progress: data });
  } catch (e) {
    console.error("[register-store-progress][PUT]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

