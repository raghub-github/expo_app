import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";
import { logAuthError, shouldClearSession } from "@/lib/auth/auth-error-handler";
import { extractR2KeyFromUrl, deleteFromR2, toStoredDocumentUrl } from "@/lib/r2";
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

    const stepStore = (progress.form_data as any)?.step_store;
    const progressStoreDbId = stepStore?.storeDbId ? Number(stepStore.storeDbId) : null;
    const progressStorePublicId = stepStore?.storePublicId;
    if (progressStoreDbId) {
      const { data: storeExists } = await db
        .from("merchant_stores")
        .select("id")
        .eq("id", progressStoreDbId)
        .maybeSingle();
      if (!storeExists) {
        return NextResponse.json({ success: true, progress: null });
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
        .select("public_url, r2_key, source_entity")
        .eq("store_id", storeDbId)
        .eq("media_scope", "MENU_REFERENCE")
        .eq("is_active", true);
      if (menuMedia && menuMedia.length > 0) {
        const formData = (progress.form_data || {}) as Record<string, unknown>;
        const step3 = (formData.step3 || {}) as Record<string, unknown>;
        const sheetRow = menuMedia.find((m: any) => m.source_entity === "ONBOARDING_MENU_SHEET");
        const imageRows = menuMedia.filter((m: any) => m.source_entity === "ONBOARDING_MENU_IMAGE");
        const rawSheetUrl = (sheetRow?.public_url || sheetRow?.r2_key || step3.menuSpreadsheetUrl) as string | null;
        const rawImageUrls = imageRows.length > 0
          ? imageRows.map((r: any) => r.public_url || r.r2_key).filter(Boolean)
          : (Array.isArray(step3.menuImageUrls) ? step3.menuImageUrls : []);
        const signedSheetUrl = toMenuProxyUrl(rawSheetUrl);
        const signedImageUrls = (rawImageUrls as string[]).map((u) => toMenuProxyUrl(u)).filter((u: string | null): u is string => !!u);
        const mergedStep3 = {
          ...step3,
          menuSpreadsheetUrl: signedSheetUrl ?? rawSheetUrl ?? step3.menuSpreadsheetUrl,
          menuImageUrls: signedImageUrls.filter(Boolean).length > 0 ? signedImageUrls : (step3.menuImageUrls ?? []),
        };
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
        };
        progress = { ...progress, form_data: { ...formData, step3: mergedStep3 } } as ProgressRow;
      }
    }

    const step3 = (progress.form_data as any)?.step3;
    if (step3 && (step3.menuSpreadsheetUrl || (Array.isArray(step3.menuImageUrls) && step3.menuImageUrls.length > 0))) {
      const signedSheet = toMenuProxyUrl(step3.menuSpreadsheetUrl || null);
      const signedImages = (Array.isArray(step3.menuImageUrls) ? step3.menuImageUrls : [])
        .map((u: string) => toMenuProxyUrl(u))
        .filter((u: string | null): u is string => !!u);
      const formData = (progress.form_data || {}) as Record<string, unknown>;
      const mergedStep3 = {
        ...step3,
        menuSpreadsheetUrl: signedSheet ?? step3.menuSpreadsheetUrl,
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

    const body = await req.json();
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

    const nextFlags = buildReconciledFlags({
      existingFlags: existing,
      existingCurrentStep: Number(existing?.current_step || 1),
      normalizedCurrentStep,
      mergedFormData,
      markStepComplete: !!markStepComplete,
    });
    const completedSteps = countCompletedSteps(nextFlags);

    let stepStore: { storeDbId: number; storePublicId: string } | null =
      mergedFormData?.step_store?.storeDbId && mergedFormData?.step_store?.storePublicId
        ? {
            storeDbId: Number(mergedFormData.step_store.storeDbId),
            storePublicId: String(mergedFormData.step_store.storePublicId),
          }
        : null;

    // If we have storePublicId but no valid storeDbId, resolve from merchant_stores (e.g. after migration).
    if (mergedFormData?.step_store?.storePublicId && (!stepStore?.storeDbId || stepStore.storeDbId <= 0)) {
      const { data: storeRow } = await db
        .from("merchant_stores")
        .select("id, store_id")
        .eq("store_id", String(mergedFormData.step_store.storePublicId))
        .maybeSingle();
      if (storeRow) {
        stepStore = { storeDbId: storeRow.id as number, storePublicId: storeRow.store_id as string };
        if (!mergedFormData.step_store) mergedFormData.step_store = {};
        mergedFormData.step_store.storeDbId = storeRow.id;
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
      const menuMode = (mergedFormData.step3 as { menuUploadMode?: string }).menuUploadMode as "IMAGE" | "CSV" | undefined;
      const imageUrls: string[] = menuMode === "CSV" ? [] : (Array.isArray(mergedFormData.step3.menuImageUrls)
        ? mergedFormData.step3.menuImageUrls.filter(Boolean)
        : []);
      const spreadsheetUrl: string | null = menuMode === "IMAGE" ? null : (mergedFormData.step3.menuSpreadsheetUrl || null);
      
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
        .select("id, r2_key, public_url, is_active")
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
        
        // Add new files with fresh signed URLs
        const newMediaRows: any[] = [];
        for (const url of imageUrls) {
          const key = typeof url === "string" ? (extractR2KeyFromUrl(url) || (url.includes("://") ? null : url.replace(/^\/+/, "")) || url) : null;
          if (key) {
            const proxyUrl = toMenuProxyUrl(key);
            newMediaRows.push({
              store_id: stepStore.storeDbId,
              media_scope: "MENU_REFERENCE",
              source_entity: "ONBOARDING_MENU_IMAGE",
              source_entity_id: null,
              original_file_name: `menu_image_${Date.now()}`,
              r2_key: key,
              public_url: proxyUrl || url,
              mime_type: "image/*",
              is_active: true,
              verification_status: "PENDING",
              uploaded_by: user.id,
            });
          }
        }
        
        if (spreadsheetUrl) {
          const key = extractR2KeyFromUrl(spreadsheetUrl) || (spreadsheetUrl.includes("://") ? null : spreadsheetUrl.replace(/^\/+/, "")) || spreadsheetUrl;
          if (key) {
            const proxyUrl = toMenuProxyUrl(key);
            newMediaRows.push({
              store_id: stepStore.storeDbId,
              media_scope: "MENU_REFERENCE",
              source_entity: "ONBOARDING_MENU_SHEET",
              source_entity_id: null,
              original_file_name: "menu_spreadsheet",
              r2_key: key,
              public_url: proxyUrl || spreadsheetUrl,
              mime_type: "application/octet-stream",
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
        // During onboarding: Delete old files from R2 and database, add new files
        const deletePromises: Promise<any>[] = [];
        
        // Delete old files from R2
        if (existingRows && existingRows.length > 0) {
          for (const row of existingRows) {
            const key = row.r2_key || extractR2KeyFromUrl(row.public_url || "");
            if (key && typeof key === "string") {
              try {
                await deleteFromR2(key);
              } catch (e) {
                console.warn("[register-store-progress] R2 delete failed for key:", key, e);
              }
            }
          }
        }
        
        // Delete old records from database
        deletePromises.push(
          Promise.resolve(
            db
              .from("merchant_store_media_files")
              .delete()
              .eq("store_id", stepStore.storeDbId)
              .eq("media_scope", "MENU_REFERENCE")
          ) as Promise<any>
        );
        
        await Promise.all(deletePromises);
        
        // Add new files with fresh signed URLs
        const mediaCandidates = [
          ...imageUrls.map((url) => {
            const key = typeof url === "string" ? (extractR2KeyFromUrl(url) || (url.includes("://") ? null : url.replace(/^\/+/, "")) || url) : null;
            const proxyUrl = key ? toMenuProxyUrl(key) : null;
            return {
              store_id: stepStore!.storeDbId,
              media_scope: "MENU_REFERENCE",
              source_entity: "ONBOARDING_MENU_IMAGE",
              source_entity_id: null,
              original_file_name: `menu_image_${Date.now()}`,
              r2_key: key,
              public_url: proxyUrl || url,
              mime_type: "image/*",
              is_active: true,
              verification_status: "PENDING",
              uploaded_by: user.id,
            };
          }),
          ...(spreadsheetUrl
            ? [
                (() => {
                  const key = extractR2KeyFromUrl(spreadsheetUrl) || (spreadsheetUrl.includes("://") ? null : spreadsheetUrl.replace(/^\/+/, "")) || spreadsheetUrl;
                  const proxyUrl = key ? toMenuProxyUrl(key) : null;
                  return {
                    store_id: stepStore.storeDbId,
                    media_scope: "MENU_REFERENCE",
                    source_entity: "ONBOARDING_MENU_SHEET",
                    source_entity_id: null,
                    original_file_name: "menu_spreadsheet",
                    r2_key: key,
                    public_url: proxyUrl || spreadsheetUrl,
                    mime_type: "application/octet-stream",
                    is_active: true,
                    verification_status: "PENDING",
                    uploaded_by: user.id,
                  };
                })(),
              ]
            : []),
        ];
        
        if (mediaCandidates.length > 0) {
          try {
            const resolvedCandidates = await Promise.all(mediaCandidates);
            await db.from("merchant_store_media_files").insert(resolvedCandidates);
          } catch (mediaError: any) {
            console.warn("[register-store-progress] media insert skipped:", mediaError.message);
            // Optional table in rollout phase.
          }
        }
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
        normalizeDocValue(docs.other_document_file_url),
      ];
      const { data: existingDocRow } = await db
        .from("merchant_store_documents")
        .select("pan_document_url, aadhaar_document_url, aadhaar_document_metadata, gst_document_url, fssai_document_url, drug_license_document_url, pharmacist_certificate_document_url, pharmacy_council_registration_document_url, other_document_url")
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

    if (stepStore?.storeDbId && mergedFormData?.step5) {
      const s5 = mergedFormData.step5 || {};
      // Store proxy URLs (stable, no expiry) so banner/gallery load in merchant profile
      const toStoredMediaUrl = (v: string | null | undefined): string | null =>
        (v && toStoredDocumentUrl(v)) || (v && typeof v === "string" ? v : null) || null;
      const logoUrlStored = toStoredMediaUrl(s5.logo_url) || s5.logo_url || null;
      const bannerUrlStored = toStoredMediaUrl(s5.banner_url) || s5.banner_url || null;
      const galleryUrlsStored = Array.isArray(s5.gallery_image_urls)
        ? s5.gallery_image_urls
            .map((u: string) => toStoredMediaUrl(u))
            .filter((u: string | null | undefined): u is string => !!u)
        : null;

      // Delete old store media (logo, banner, gallery) that were removed or replaced
      const { data: prevStoreRow } = await db
        .from("merchant_stores")
        .select("logo_url, banner_url, gallery_images")
        .eq("id", stepStore.storeDbId)
        .maybeSingle();

      const mediaKeysToDelete: string[] = [];
      const diffMedia = (oldVal: unknown, newVal: string | null | undefined) => {
        if (!oldVal || typeof oldVal !== "string") return;
        const oldUrl = oldVal.trim();
        if (!oldUrl) return;
        const oldKey = extractR2KeyFromUrl(oldUrl);
        if (!oldKey) return;

        const newUrl = typeof newVal === "string" ? newVal.trim() : "";
        const newKey =
          typeof newVal === "string"
            ? extractR2KeyFromUrl(newVal) ||
              (newVal.includes("://") ? null : newVal.replace(/^\/+/, ""))
            : null;

        const nowEmpty = !newUrl;
        const replaced = !!newUrl && (!newKey || newKey !== oldKey);
        if (nowEmpty || replaced) {
          mediaKeysToDelete.push(oldKey);
        }
      };

      if (prevStoreRow) {
        diffMedia(prevStoreRow.logo_url, logoUrlStored);
        diffMedia(prevStoreRow.banner_url, bannerUrlStored);

        const prevGallery: string[] = Array.isArray((prevStoreRow as any).gallery_images)
          ? ((prevStoreRow as any).gallery_images as string[])
          : [];
        const newGallery: string[] = Array.isArray(galleryUrlsStored) ? galleryUrlsStored : [];
        const newKeys = new Set(
          newGallery
            .map((u) => extractR2KeyFromUrl(u) || (u.includes("://") ? null : u.replace(/^\/+/, "")))
            .filter((k): k is string => !!k)
        );
        for (const url of prevGallery) {
          if (!url || typeof url !== "string") continue;
          const key = extractR2KeyFromUrl(url) || (url.includes("://") ? null : url.replace(/^\/+/, ""));
          if (key && !newKeys.has(key)) {
            mediaKeysToDelete.push(key);
          }
        }
      }

      await db
        .from("merchant_stores")
        .update({
          cuisine_types: s5.cuisine_types || [],
          food_categories: s5.food_categories || [],
          avg_preparation_time_minutes: s5.avg_preparation_time_minutes ?? 30,
          min_order_amount: s5.min_order_amount ?? 0,
          delivery_radius_km: s5.delivery_radius_km ?? null,
          is_pure_veg: !!s5.is_pure_veg,
          accepts_online_payment: s5.accepts_online_payment !== false,
          accepts_cash: s5.accepts_cash !== false,
          logo_url: logoUrlStored,
          banner_url: bannerUrlStored,
          gallery_images: galleryUrlsStored,
          current_onboarding_step: normalizedNextStep,
        })
        .eq("id", stepStore.storeDbId);

      if (mediaKeysToDelete.length > 0) {
        for (const key of mediaKeysToDelete) {
          try {
            await deleteFromR2(key);
          } catch (e) {
            console.warn("[register-store-progress] R2 delete store media failed:", key, e);
          }
        }
      }

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

