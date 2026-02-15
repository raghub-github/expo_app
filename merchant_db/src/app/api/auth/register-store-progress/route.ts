import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { validateMerchantFromSession } from "@/lib/auth/validate-merchant";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getSupabaseAdmin() {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function toEnumStoreType(raw: string | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.toUpperCase();
  return normalized === "OTHERS" ? "OTHERS" : normalized;
}

type ProgressFlags = {
  step_1_completed: boolean;
  step_2_completed: boolean;
  step_3_completed: boolean;
  step_4_completed: boolean;
  step_5_completed: boolean;
  step_6_completed: boolean;
};

const STEP_KEYS: Array<keyof ProgressFlags> = [
  "step_1_completed",
  "step_2_completed",
  "step_3_completed",
  "step_4_completed",
  "step_5_completed",
  "step_6_completed",
];

function buildReconciledFlags(params: {
  existingFlags?: Partial<ProgressFlags> | null;
  existingCurrentStep?: number | null;
  normalizedCurrentStep: number;
  mergedFormData?: Record<string, unknown> | null;
  markStepComplete?: boolean;
}): ProgressFlags {
  const {
    existingFlags,
    existingCurrentStep,
    normalizedCurrentStep,
    mergedFormData,
    markStepComplete,
  } = params;

  const nextFlags: ProgressFlags = {
    step_1_completed: !!existingFlags?.step_1_completed,
    step_2_completed: !!existingFlags?.step_2_completed,
    step_3_completed: !!existingFlags?.step_3_completed,
    step_4_completed: !!existingFlags?.step_4_completed,
    step_5_completed: !!existingFlags?.step_5_completed,
    step_6_completed: !!existingFlags?.step_6_completed,
  };

  // Auto-heal older rows: if current_step already moved ahead, prior steps are considered completed.
  const maxReachedStep = Math.max(
    Number.isFinite(Number(existingCurrentStep)) ? Number(existingCurrentStep) : 1,
    normalizedCurrentStep
  );
  for (let i = 1; i < maxReachedStep; i++) {
    nextFlags[`step_${i}_completed` as keyof ProgressFlags] = true;
  }

  // Also infer completion from saved payloads.
  const formData = mergedFormData || {};
  if (formData.step1) nextFlags.step_1_completed = true;
  if (formData.step2) nextFlags.step_2_completed = true;
  if (formData.step3) nextFlags.step_3_completed = true;
  if (formData.step4) nextFlags.step_4_completed = true;
  if (formData.step5) nextFlags.step_5_completed = true;
  if (formData.final) nextFlags.step_6_completed = true;

  if (markStepComplete) {
    nextFlags[`step_${normalizedCurrentStep}_completed` as keyof ProgressFlags] = true;
  }

  return nextFlags;
}

function countCompletedSteps(flags: ProgressFlags) {
  return STEP_KEYS.reduce((acc, key) => acc + (flags[key] ? 1 : 0), 0);
}

async function generateStorePublicId(db: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await db
    .from("merchant_stores")
    .select("store_id");
  if (error) throw new Error("Unable to generate store id");
  let maxNum = 1000;
  for (const row of data || []) {
    const match = typeof row.store_id === "string" && row.store_id.match(/^GMMC(\d+)$/);
    if (match) maxNum = Math.max(maxNum, Number(match[1]));
  }
  return `GMMC${maxNum + 1}`;
}

async function upsertStoreDraft(db: ReturnType<typeof getSupabaseAdmin>, params: {
  parentId: number;
  step1: any;
  step2: any;
  existingStoreDbId?: number | null;
  nextStep: number;
}) {
  const { parentId, step1, step2, existingStoreDbId, nextStep } = params;
  if (!step1?.store_name || !step2?.full_address || !step2?.city || !step2?.state || !step2?.postal_code) {
    return null;
  }

  if (existingStoreDbId) {
    const { data, error } = await db
      .from("merchant_stores")
      .update({
        store_name: step1.store_name,
        store_display_name: step1.store_display_name || null,
        store_description: step1.store_description || null,
        store_email: step1.store_email || null,
        store_phones: step1.store_phones || [],
        full_address: step2.full_address,
        landmark: step2.landmark || null,
        city: step2.city,
        state: step2.state,
        postal_code: step2.postal_code,
        country: step2.country || "IN",
        latitude: step2.latitude,
        longitude: step2.longitude,
        current_onboarding_step: nextStep,
        onboarding_completed: false,
        approval_status: "DRAFT",
        status: "INACTIVE",
        store_type: toEnumStoreType(step1.store_type),
        is_active: false,
        is_accepting_orders: false,
        is_available: false,
      })
      .eq("id", existingStoreDbId)
      .select("id, store_id")
      .single();
    if (error) throw new Error(error.message);
    return { storeDbId: data.id as number, storePublicId: data.store_id as string };
  }

  const generatedStoreId = await generateStorePublicId(db);
  const { data, error } = await db
    .from("merchant_stores")
    .insert([
      {
        store_id: generatedStoreId,
        parent_id: parentId,
        store_name: step1.store_name,
        store_display_name: step1.store_display_name || null,
        store_description: step1.store_description || null,
        store_email: step1.store_email || null,
        store_phones: step1.store_phones || [],
        full_address: step2.full_address,
        landmark: step2.landmark || null,
        city: step2.city,
        state: step2.state,
        postal_code: step2.postal_code,
        country: step2.country || "IN",
        latitude: step2.latitude,
        longitude: step2.longitude,
        status: "INACTIVE",
        approval_status: "DRAFT",
        current_onboarding_step: nextStep,
        onboarding_completed: false,
        is_active: false,
        is_accepting_orders: false,
        is_available: false,
        operational_status: "CLOSED",
        store_type: toEnumStoreType(step1.store_type),
      },
    ])
    .select("id, store_id")
    .single();
  if (error) throw new Error(error.message);
  return { storeDbId: data.id as number, storePublicId: data.store_id as string };
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
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
    let progressQuery = db
      .from("merchant_store_registration_progress")
      .select("*")
      .eq("parent_id", validation.merchantParentId)
      .neq("registration_status", "COMPLETED");

    if (storePublicId) {
      progressQuery = progressQuery.contains("form_data", { step_store: { storePublicId } });
    }

    const { data: progress, error } = await progressQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch progress" },
        { status: 500 }
      );
    }

    if (!progress) {
      return NextResponse.json({ success: true, progress: null });
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

    if (userError || !user) {
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

    const mergedFormData: any = {
      ...(existing?.form_data || {}),
      ...(formDataPatch || {}),
    };

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

    if (normalizedCurrentStep >= 2) {
      stepStore = await upsertStoreDraft(db, {
        parentId: validation.merchantParentId,
        step1: mergedFormData?.step1,
        step2: mergedFormData?.step2,
        existingStoreDbId: stepStore?.storeDbId,
        nextStep: normalizedNextStep,
      });
      if (stepStore) {
        mergedFormData.step_store = {
          storeDbId: stepStore.storeDbId,
          storePublicId: stepStore.storePublicId,
        };
      }
    }

    if (stepStore?.storeDbId && mergedFormData?.step3) {
      const imageUrls: string[] = Array.isArray(mergedFormData.step3.menuImageUrls)
        ? mergedFormData.step3.menuImageUrls.filter(Boolean)
        : [];
      const spreadsheetUrl: string | null = mergedFormData.step3.menuSpreadsheetUrl || null;
      const mediaCandidates = [
        ...imageUrls.map((url) => ({
          store_id: stepStore!.storeDbId,
          media_scope: "MENU_REFERENCE",
          source_entity: "ONBOARDING_MENU_IMAGE",
          public_url: url,
          r2_key: typeof url === "string" ? url.split("/").slice(3).join("/") || url : null,
          mime_type: "image/*",
          is_active: true,
        })),
        ...(spreadsheetUrl
          ? [
              {
                store_id: stepStore.storeDbId,
                media_scope: "MENU_REFERENCE",
                source_entity: "ONBOARDING_MENU_SHEET",
                public_url: spreadsheetUrl,
                r2_key: spreadsheetUrl.split("/").slice(3).join("/") || spreadsheetUrl,
                mime_type: "application/octet-stream",
                is_active: true,
              },
            ]
          : []),
      ];
      if (mediaCandidates.length > 0) {
        try {
          const { data: existingMedia } = await db
            .from("merchant_store_media_files")
            .select("public_url")
            .eq("store_id", stepStore.storeDbId)
            .eq("media_scope", "MENU_REFERENCE");
          const existingUrls = new Set((existingMedia || []).map((row: any) => row.public_url));
          const toInsert = mediaCandidates.filter((row) => !existingUrls.has(row.public_url));
          if (toInsert.length > 0) await db.from("merchant_store_media_files").insert(toInsert);
        } catch {
          // Optional table in rollout phase.
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
      const docRow: any = {
        store_id: stepStore.storeDbId,
        pan_document_number: docs.pan_number || null,
        pan_document_url: docs.pan_image_url || null,
        pan_document_name: (docs.pan_image?.name ?? (docs.pan_image_url ? "pan" : null)) || null,
        pan_holder_name: docs.pan_holder_name || null,
        aadhaar_document_number: docs.aadhar_number || null,
        aadhaar_document_url: docs.aadhar_front_url || null,
        aadhaar_document_name: (docs.aadhar_front?.name ?? (docs.aadhar_front_url ? "aadhaar_front" : null)) || null,
        aadhaar_holder_name: docs.aadhar_holder_name || null,
        aadhaar_document_metadata:
          docs.aadhar_back_url != null ? { back_url: docs.aadhar_back_url } : {},
        gst_document_number: docs.gst_number || null,
        gst_document_url: docs.gst_image_url || null,
        gst_document_name: (docs.gst_image?.name ?? (docs.gst_image_url ? "gst" : null)) || null,
        fssai_document_number: docs.fssai_number || null,
        fssai_document_url: docs.fssai_image_url || null,
        fssai_document_name: (docs.fssai_image?.name ?? (docs.fssai_image_url ? "fssai" : null)) || null,
        fssai_expiry_date: parseDate(docs.fssai_expiry_date),
        drug_license_document_number: docs.drug_license_number || null,
        drug_license_document_url: docs.drug_license_image_url || null,
        drug_license_document_name:
          (docs.drug_license_image?.name ?? (docs.drug_license_image_url ? "drug_license" : null)) || null,
        drug_license_expiry_date: parseDate(docs.drug_license_expiry_date),
        pharmacist_certificate_document_number: docs.pharmacist_registration_number || null,
        pharmacist_certificate_document_url: docs.pharmacist_certificate_url || null,
        pharmacist_certificate_document_name:
          (docs.pharmacist_certificate?.name ?? (docs.pharmacist_certificate_url ? "pharmacist" : null)) || null,
        pharmacist_certificate_expiry_date: parseDate(docs.pharmacist_expiry_date),
        pharmacy_council_registration_document_url: docs.pharmacy_council_registration_url || null,
        pharmacy_council_registration_document_name:
          (docs.pharmacy_council_registration?.name ??
            (docs.pharmacy_council_registration_url ? "pharmacy_council" : null)) || null,
        other_document_number: docs.other_document_number || null,
        other_document_url: docs.other_document_file_url || null,
        other_document_name:
          (docs.other_document_file?.name ?? (docs.other_document_file_url ? "other" : null)) || null,
        other_document_type: docs.other_document_type || null,
        other_expiry_date: parseDate(docs.other_document_expiry_date),
      };
      await db.from("merchant_store_documents").upsert([docRow], { onConflict: "store_id" });

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
            bank_proof_file_url: bank.bank_proof_file_url || null,
            upi_qr_screenshot_url: null,
            is_primary: true,
            is_active: true,
          });
        } catch (bankErr) {
          console.warn("[register-store-progress] bank insert skipped:", bankErr);
        }
      } else if (hasUpiDetails) {
        try {
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
            upi_qr_screenshot_url: bank.upi_qr_screenshot_url || null,
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
          logo_url: s5.logo_url || null,
          banner_url: s5.banner_url || null,
          gallery_images: Array.isArray(s5.gallery_image_urls) ? s5.gallery_image_urls : null,
          current_onboarding_step: normalizedNextStep,
        })
        .eq("id", stepStore.storeDbId);

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
      const dayRow = (d: any) => {
        const closed = !!d?.closed;
        const slot1Start = closed ? null : d?.slot1_open ?? d?.open ?? null;
        const slot1End = closed ? null : d?.slot1_close ?? d?.close ?? null;
        const slot2Start = closed ? null : d?.slot2_open ?? null;
        const slot2End = closed ? null : d?.slot2_close ?? null;
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
      await db.from("merchant_store_operating_hours").upsert([operatingHoursRow], { onConflict: "store_id" });
    }

    const payload = {
      parent_id: validation.merchantParentId,
      store_id: existing?.store_id ?? null,
      current_step: normalizedNextStep,
      total_steps: 9,
      completed_steps: completedSteps,
      ...nextFlags,
      form_data: mergedFormData,
      registration_status: registrationStatus,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      const { data, error } = await db
        .from("merchant_store_registration_progress")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) {
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
      return NextResponse.json({ success: false, error: "Failed to create progress" }, { status: 500 });
    }

    return NextResponse.json({ success: true, progress: data });
  } catch (e) {
    console.error("[register-store-progress][PUT]", e);
    return NextResponse.json({ success: false, error: "Internal error" }, { status: 500 });
  }
}

