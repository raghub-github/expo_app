import { getR2SignedUrl, extractR2KeyFromUrl, deleteFromR2, normalizeMerchantStoreMediaUrl } from "@/lib/r2";

/** Deep merge patch into target (for form_data). Ensures edits to one step don't wipe others; arrays and primitives from patch replace. */
export function deepMergeFormData(
  target: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(patch)) {
    const patchVal = patch[key];
    if (patchVal === null || patchVal === undefined) {
      result[key] = patchVal;
      continue;
    }
    const existing = result[key];
    if (
      typeof patchVal === "object" &&
      !Array.isArray(patchVal) &&
      patchVal !== null &&
      typeof existing === "object" &&
      existing !== null &&
      !Array.isArray(existing)
    ) {
      result[key] = deepMergeFormData(
        existing as Record<string, unknown>,
        patchVal as Record<string, unknown>
      );
    } else {
      result[key] = patchVal;
    }
  }
  return result;
}

/** Returns a fresh R2 signed URL for display; avoids expired URLs. Uses 7-day expiry for progress responses. */
export async function toFreshSignedUrl(
  storedUrlOrKey: string | null | undefined
): Promise<string | null> {
  if (!storedUrlOrKey || typeof storedUrlOrKey !== "string") return null;
  const key =
    extractR2KeyFromUrl(storedUrlOrKey) ||
    (storedUrlOrKey.includes("://")
      ? null
      : storedUrlOrKey.replace(/^\/+/, ""));
  if (!key) return storedUrlOrKey;
  try {
    return await getR2SignedUrl(key, 86400 * 7); // 7 days
  } catch {
    return storedUrlOrKey;
  }
}

/** Returns proxy URL for menu files (no expiry; works for private R2). */
export function toMenuProxyUrl(
  storedUrlOrKey: string | null | undefined
): string | null {
  if (!storedUrlOrKey || typeof storedUrlOrKey !== "string") return null;
  const key =
    extractR2KeyFromUrl(storedUrlOrKey) ||
    (storedUrlOrKey.includes("://")
      ? null
      : storedUrlOrKey.replace(/^\/+/, ""));
  if (!key) return storedUrlOrKey;
  return `/api/attachments/proxy?key=${encodeURIComponent(key)}`;
}

export function toEnumStoreType(raw: string | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.toUpperCase().replace(/\s+/g, "_");
  const allowed: Record<string, string> = {
    RESTAURANT: "RESTAURANT",
    CAFE: "CAFE",
    BAKERY: "BAKERY",
    CLOUD_KITCHEN: "CLOUD_KITCHEN",
    GROCERY: "GROCERY",
    PHARMA: "PHARMA",
    STATIONERY: "STATIONERY",
    ELECTRONICS_ECOMMERCE: "ELECTRONICS_ECOMMERCE",
    OTHERS: "OTHERS",
    // Legacy / alias values seen in older rows
    FOOD: "RESTAURANT",
    GENERAL: "OTHERS",
  };
  // Never return an unknown label — invalid enum aborts merchant_stores INSERT.
  return allowed[normalized] ?? null;
}

export type ProgressFlags = {
  step_1_completed: boolean;
  step_2_completed: boolean;
  step_3_completed: boolean;
  step_4_completed: boolean;
  step_5_completed: boolean;
  step_6_completed: boolean;
  step_7_completed: boolean;
  step_8_completed: boolean;
  step_9_completed: boolean;
};

export const STEP_KEYS: Array<keyof ProgressFlags> = [
  "step_1_completed",
  "step_2_completed",
  "step_3_completed",
  "step_4_completed",
  "step_5_completed",
  "step_6_completed",
  "step_7_completed",
  "step_8_completed",
  "step_9_completed",
];

/** Shape of form_data we read for step_store.storePublicId; form_data is otherwise unknown. */
export type ProgressFormData = {
  step_store?: { storePublicId?: string };
  [key: string]: unknown;
};

export type ProgressRow = ProgressFlags & {
  id: number;
  form_data?: unknown;
  current_step?: number;
  completed_steps?: number;
  [key: string]: unknown;
};

const FOOD_STORE_TYPES = new Set([
  "RESTAURANT",
  "CAFE",
  "BAKERY",
  "CLOUD_KITCHEN",
  "FOOD_TRUCK",
  "ICE_CREAM_PARLOR",
  "FOOD",
]);

function hasNonEmpty(v: unknown): boolean {
  return typeof v === "string" ? v.trim().length > 0 : v != null && String(v).trim().length > 0;
}

/**
 * Step 4 is only complete when required doc subsections are done —
 * PAN alone (even auto-verified) must NOT advance the user to step 5.
 */
export function isStep4ActuallyComplete(
  formData?: Record<string, unknown> | null,
): boolean {
  const step4 = (formData?.step4 && typeof formData.step4 === "object"
    ? formData.step4
    : null) as Record<string, unknown> | null;
  if (!step4) return false;

  const panOk =
    step4.pan_is_verified === true ||
    hasNonEmpty(step4.pan_image_url) ||
    hasNonEmpty(step4.pan_document_url);
  if (!panOk) return false;

  const step1 = (formData?.step1 && typeof formData.step1 === "object"
    ? formData.step1
    : null) as Record<string, unknown> | null;
  const storeType = String(step1?.store_type || step1?.business_type || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (FOOD_STORE_TYPES.has(storeType)) {
    const fssaiOk =
      hasNonEmpty(step4.fssai_number) &&
      (hasNonEmpty(step4.fssai_image_url) || hasNonEmpty(step4.fssai_document_url)) &&
      hasNonEmpty(step4.fssai_expiry_date);
    if (!fssaiOk) return false;
  }

  if (storeType === "PHARMA") {
    const pharmaOk =
      hasNonEmpty(step4.drug_license_number) &&
      (hasNonEmpty(step4.drug_license_image_url) ||
        hasNonEmpty(step4.drug_license_document_url)) &&
      hasNonEmpty(step4.drug_license_expiry_date) &&
      hasNonEmpty(step4.pharmacist_registration_number) &&
      (hasNonEmpty(step4.pharmacist_certificate_url) ||
        hasNonEmpty(step4.pharmacist_certificate_document_url)) &&
      (hasNonEmpty(step4.pharmacy_council_registration_url) ||
        hasNonEmpty(step4.pharmacy_council_registration_document_url)) &&
      hasNonEmpty(step4.pharmacist_expiry_date);
    if (!pharmaOk) return false;
  }

  const bank = (step4.bank && typeof step4.bank === "object"
    ? step4.bank
    : null) as Record<string, unknown> | null;
  if (!bank) return false;
  const method = String(bank.payout_method || "bank").toLowerCase();
  if (method === "upi") {
    if (!hasNonEmpty(bank.upi_id)) return false;
    if (Boolean(bank.upi_verified)) return true;
    if (
      !hasNonEmpty(bank.upi_qr_screenshot_url) &&
      !hasNonEmpty(bank.upi_qr_file_url)
    ) {
      return false;
    }
  } else {
    const bankVerified = Boolean(bank.bank_is_verified);
    const bankOk =
      hasNonEmpty(bank.account_holder_name) &&
      hasNonEmpty(bank.account_number) &&
      hasNonEmpty(bank.ifsc_code) &&
      hasNonEmpty(bank.bank_name) &&
      (bankVerified ||
        (hasNonEmpty(bank.bank_proof_type) && hasNonEmpty(bank.bank_proof_file_url)));
    if (!bankOk) return false;
  }

  return true;
}

export function buildReconciledFlags(params: {
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
    step_7_completed: !!(existingFlags as any)?.step_7_completed,
    step_8_completed: !!(existingFlags as any)?.step_8_completed,
    step_9_completed: !!(existingFlags as any)?.step_9_completed,
  };

  // Auto-heal older rows: if current_step already moved ahead, prior steps are considered completed.
  const maxReachedStep = Math.max(
    Number.isFinite(Number(existingCurrentStep)) ? Number(existingCurrentStep) : 1,
    normalizedCurrentStep
  );
  for (let i = 1; i < maxReachedStep; i++) {
    nextFlags[`step_${i}_completed` as keyof ProgressFlags] = true;
  }

  // Infer completion from payloads only for steps we've already moved past.
  // (Having draft step4 data must NOT mark step 4 complete while the user is still on it.)
  const formData = mergedFormData || {};
  if (maxReachedStep > 1 && (formData as any).step1) nextFlags.step_1_completed = true;
  if (maxReachedStep > 2 && (formData as any).step2) nextFlags.step_2_completed = true;
  if (maxReachedStep > 3 && (formData as any).step3) nextFlags.step_3_completed = true;
  if (maxReachedStep > 4 && (formData as any).step4) nextFlags.step_4_completed = true;
  if (maxReachedStep > 5 && (formData as any).step5) nextFlags.step_5_completed = true;
  if ((formData as any).final) nextFlags.step_9_completed = true;

  if (markStepComplete) {
    nextFlags[`step_${normalizedCurrentStep}_completed` as keyof ProgressFlags] =
      true;
  }

  // Never treat step 4 as done until required docs (PAN + bank + FSSAI/pharma) are present.
  // PAN auto-verify alone used to leave a stale step_4_completed and jump users to step 5 on reload.
  if (!isStep4ActuallyComplete(formData)) {
    nextFlags.step_4_completed = false;
  }

  return nextFlags;
}

export function countCompletedSteps(flags: ProgressFlags) {
  return STEP_KEYS.reduce((acc, key) => acc + (flags[key] ? 1 : 0), 0);
}

export async function generateStorePublicId(db: any) {
  // Use the database function for consistent Store ID generation
  const { data, error } = await db.rpc("generate_unique_store_id");
  if (error) {
    console.error("Error calling generate_unique_store_id function:", error);
    // Fallback to the original logic if the function doesn't exist
    const { data: storeData, error: storeError } = await db
      .from("merchant_stores")
      .select("store_id");
    if (storeError) throw new Error("Unable to generate store id");

    // Also check progress table for any pending Store IDs
    const { data: progressData } = await db
      .from("merchant_store_registration_progress")
      .select("form_data");

    let maxNum = 1000;

    // Check merchant_stores
    for (const row of storeData || []) {
      const match =
        typeof row.store_id === "string" &&
        row.store_id.match(/^GMMC(\d+)$/);
      if (match) maxNum = Math.max(maxNum, Number(match[1]));
    }

    // Check progress table
    for (const row of progressData || []) {
      const storePublicId = (row.form_data as ProgressFormData | null | undefined)
        ?.step_store?.storePublicId;
      if (typeof storePublicId === "string") {
        const match = storePublicId.match(/^GMMC(\d+)$/);
        if (match) maxNum = Math.max(maxNum, Number(match[1]));
      }
    }

    return `GMMC${maxNum + 1}`;
  }
  return data;
}

/** Insert merchant_stores row when step 1 is completed (so store_id exists in DB immediately). */
export async function insertStoreAfterStep1(
  db: any,
  params: { parentId: number; step1: any; generatedStoreId: string }
): Promise<{ storeDbId: number; storePublicId: string }> {
  const { parentId, step1, generatedStoreId } = params;
  const storeName =
    step1?.store_name != null ? String(step1.store_name).trim() : "";
  if (!storeName || !generatedStoreId) {
    console.warn("[insertStoreAfterStep1] Missing required fields:", {
      hasStoreName: !!storeName,
      hasGeneratedStoreId: !!generatedStoreId,
      step1Keys: step1 ? Object.keys(step1) : [],
    });
    throw new Error("Store name is required to create the store draft.");
  }

  // Schema alignment: merchant_stores has status store_status ('ACTIVE'|'INACTIVE'), not 'DRAFT'.
  // Use INACTIVE for new draft stores; approval_status can be 'DRAFT'.
  // Address NOT NULL columns get placeholders until step 2 overwrites them.
  const payload: any = {
    store_id: generatedStoreId,
    parent_id: parentId,
    store_name: storeName,
    owner_full_name: step1.owner_full_name && String(step1.owner_full_name).trim() ? String(step1.owner_full_name).trim() : null,
    store_display_name: step1.store_display_name || null,
    store_description: step1.store_description || null,
    store_type: toEnumStoreType(step1.store_type) || "RESTAURANT",
    custom_store_type:
      step1.custom_store_type && String(step1.custom_store_type).trim()
        ? String(step1.custom_store_type).trim()
        : null,
    store_email: step1.store_email || "",
    store_phones: Array.isArray(step1.store_phones)
      ? step1.store_phones.filter((p: unknown) => typeof p === "string" && String(p).trim())
      : [],
    full_address: "Pending",
    city: "Pending",
    state: "Pending",
    postal_code: "000000",
    country: "IN",
    current_onboarding_step: 1,
    onboarding_completed: false,
    approval_status: "DRAFT",
    status: "INACTIVE",
    is_active: false,
    is_accepting_orders: false,
    is_available: false,
    operational_status: "CLOSED",
  };

  console.log("[insertStoreAfterStep1] Attempting insert with payload:", {
    store_id: payload.store_id,
    parent_id: payload.parent_id,
    store_name: payload.store_name,
    store_type: payload.store_type,
    has_store_email: !!payload.store_email,
  });

  const { data, error } = await db
    .from("merchant_stores")
    .insert([payload])
    .select("id, store_id")
    .single();

  if (error) {
    if (error.code === "23505") {
      console.log(
        "[insertStoreAfterStep1] Duplicate key, fetching existing store:",
        generatedStoreId
      );
      const { data: existing } = await db
        .from("merchant_stores")
        .select("id, store_id, parent_id")
        .eq("store_id", generatedStoreId)
        .maybeSingle();
      if (existing) {
        // Re-use only when it belongs to this parent; otherwise mint would collide — surface error.
        if (Number(existing.parent_id) === Number(parentId)) {
          console.log("[insertStoreAfterStep1] Found existing store:", existing);
          return {
            storeDbId: existing.id as number,
            storePublicId: existing.store_id as string,
          };
        }
        throw new Error(
          `Store ID ${generatedStoreId} already exists under another parent. Please retry.`
        );
      }
    }
    console.error("[register-store-progress] insertStoreAfterStep1 failed:", {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      payload: JSON.stringify(payload, null, 2),
    });
    throw new Error(error.message || "Failed to create store in merchant_stores.");
  }

  if (!data?.id || !data?.store_id) {
    console.error(
      "[insertStoreAfterStep1] Insert succeeded but no data returned"
    );
    throw new Error("Store insert returned no row. Check database permissions.");
  }

  // Confirm visible to subsequent reads (guards against silent RLS / select mismatch).
  const { data: verified, error: verifyErr } = await db
    .from("merchant_stores")
    .select("id, store_id")
    .eq("id", data.id)
    .maybeSingle();
  if (verifyErr || !verified) {
    throw new Error(
      verifyErr?.message ||
        "Store was not readable after insert. Please try again."
    );
  }

  console.log("[insertStoreAfterStep1] Successfully created store:", {
    storeDbId: verified.id,
    storePublicId: verified.store_id,
  });
  return {
    storeDbId: verified.id as number,
    storePublicId: verified.store_id as string,
  };
}

export async function upsertStoreDraft(
  db: any,
  params: {
    parentId: number;
    step1: any;
    step2: any;
    existingStoreDbId?: number | null;
    nextStep: number;
  }
) {
  const { parentId, step1, step2, existingStoreDbId, nextStep } = params;
  if (
    !step1?.store_name ||
    !step2?.full_address ||
    !step2?.city ||
    !step2?.state ||
    !step2?.postal_code
  ) {
    return null;
  }

  // Compose: Flat/Unit No + Floor/Tower + Building/Complex Name + Full Address
  const composedFullAddress = [
    step2?.unit_number,
    step2?.floor_number,
    step2?.building_name,
    step2?.full_address,
  ]
    .filter((part: unknown) => typeof part === "string" && (part as string).trim().length > 0)
    .join(", ") || step2.full_address;

  const draftPayload = {
    store_name: step1.store_name,
    store_display_name: step1.store_display_name || null,
    store_description: step1.store_description || null,
    store_email: step1.store_email || null,
    store_phones: step1.store_phones || [],
    full_address: composedFullAddress,
    landmark: step2.landmark || null,
    city: step2.city,
    state: step2.state,
    postal_code: step2.postal_code,
    country: step2.country || "IN",
    latitude: step2.latitude,
    longitude: step2.longitude,
    current_onboarding_step: nextStep,
    onboarding_completed: false,
    approval_status: "DRAFT" as const,
    status: "INACTIVE" as const,
    store_type: toEnumStoreType(step1.store_type) || "RESTAURANT",
    is_active: false,
    is_accepting_orders: false,
    is_available: false,
    operational_status: "CLOSED" as const,
  };

  if (existingStoreDbId) {
    const { data: storeExists } = await db
      .from("merchant_stores")
      .select("id, store_id, onboarding_completed, approval_status")
      .eq("id", existingStoreDbId)
      .maybeSingle();
    if (!storeExists) {
      // Store was deleted (e.g. manually); fall through to create new or reuse DRAFT
    } else {
      const approval = String(storeExists.approval_status || "").toUpperCase();
      const terminal =
        storeExists.onboarding_completed === true ||
        ["SUBMITTED", "UNDER_VERIFICATION", "PENDING_VERIFICATION", "APPROVED"].includes(approval);
      if (terminal) {
        return {
          storeDbId: storeExists.id as number,
          storePublicId: storeExists.store_id as string,
        };
      }
      const { data, error } = await db
        .from("merchant_stores")
        .update(draftPayload)
        .eq("id", existingStoreDbId)
        .select("id, store_id")
        .single();
      if (error) throw new Error(error.message);
      return {
        storeDbId: data.id as number,
        storePublicId: data.store_id as string,
      };
    }
  }

  // Ensure only one DRAFT store per parent *when we don't already have a target id*:
  // reuse existing DRAFT if any (avoids multiple stores from race/double-save)
  if (!existingStoreDbId) {
    const { data: existingDraft } = await db
      .from("merchant_stores")
      .select("id, store_id")
      .eq("parent_id", parentId)
      .eq("approval_status", "DRAFT")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingDraft) {
      const { data, error } = await db
        .from("merchant_stores")
        .update(draftPayload)
        .eq("id", existingDraft.id)
        .select("id, store_id")
        .single();
      if (error) throw new Error(error.message);
      return {
        storeDbId: data.id as number,
        storePublicId: data.store_id as string,
      };
    }
  }

  const generatedStoreId = await generateStorePublicId(db);
  const { data, error } = await db
    .from("merchant_stores")
    .insert([
      {
        store_id: generatedStoreId,
        parent_id: parentId,
        ...draftPayload,
      },
    ])
    .select("id, store_id")
    .single();
  if (error) throw new Error(error.message);
  return {
    storeDbId: data.id as number,
    storePublicId: data.store_id as string,
  };
}

/** Narrow shape passed to step-5 sync; export for call-site assertion (avoids Supabase generic depth). */
export type Step5Supabase = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (col: string, val: unknown) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> };
    };
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => {
        select: (columns: string) => {
          maybeSingle: () => Promise<{
            data: unknown;
            error: { message?: string; code?: string } | null;
          }>;
        };
      };
    };
  };
};

/**
 * Writes onboarding step 5 fields to merchant_stores.
 * Schema-aligned: banner_url, gallery_images, cuisine_types, delivery_radius_km, prep/min order, payment toggles, current_onboarding_step.
 * Omits logo_url / food_categories (dropped from DB). Logo stays in registration progress JSON only.
 */
export async function syncMerchantStoreFromStep5(
  db: Step5Supabase,
  storeDbId: number,
  s5: Record<string, unknown>,
  normalizedNextStep: number
): Promise<void> {
  const MIN_DELIVERY_RADIUS_KM = 1;
  const MAX_DELIVERY_RADIUS_KM = 8;

  const parseFiniteNumber = (v: unknown): number | null => {
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };

  const isSerializedUploadFile = (v: unknown) =>
    v != null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    typeof (v as { name?: unknown }).name === "string" &&
    typeof (v as { size?: unknown }).size === "number";

  const { data: prevRaw } = await db
    .from("merchant_stores")
    .select("banner_url, gallery_images")
    .eq("id", storeDbId)
    .maybeSingle();

  const prevStoreRow = prevRaw as { banner_url?: string | null; gallery_images?: string[] | null } | null;

  const pickMedia = (urlKey: string, previewKey: string): string | null => {
    const u = s5[urlKey];
    const p = s5[previewKey];
    const raw =
      (typeof u === "string" && u.trim() ? u : null) ||
      (typeof p === "string" && p.trim() ? p : null) ||
      "";
    const t = raw.trim();
    if (!t || t.startsWith("data:") || t.startsWith("blob:")) return null;
    return normalizeMerchantStoreMediaUrl(t);
  };

  let bannerUrlStored = pickMedia("banner_url", "banner_preview");
  const bannerKeyPresent =
    Object.prototype.hasOwnProperty.call(s5, "banner_url") ||
    Object.prototype.hasOwnProperty.call(s5, "banner_preview");
  // Only clear when client explicitly asks — empty "" from partial step5 patches must NOT wipe R2/DB.
  const bannerExplicitlyCleared = s5.clear_banner === true;

  const fromGalleryUrls = Array.isArray(s5.gallery_image_urls) ? (s5.gallery_image_urls as unknown[]) : [];
  const fromGalleryPreviews = Array.isArray(s5.gallery_previews) ? (s5.gallery_previews as unknown[]) : [];
  const rawGalleryList: unknown[] =
    fromGalleryUrls.length > 0 ? fromGalleryUrls : fromGalleryPreviews.length > 0 ? fromGalleryPreviews : [];
  let galleryUrlsForStore: string[] = rawGalleryList
    .filter((x): x is string => typeof x === "string" && !!x.trim() && !x.startsWith("data:") && !x.startsWith("blob:"))
    .map((u) => normalizeMerchantStoreMediaUrl(u.trim()))
    .filter((u): u is string => !!u);

  // Keep previous banner when patch omitted media or sent empty strings (common after step 6–9 saves).
  if (
    !bannerUrlStored &&
    !bannerExplicitlyCleared &&
    prevStoreRow?.banner_url &&
    !isSerializedUploadFile(s5.banner)
  ) {
    bannerUrlStored = normalizeMerchantStoreMediaUrl(String(prevStoreRow.banner_url));
  }

  const galleryKeyPresent =
    Object.prototype.hasOwnProperty.call(s5, "gallery_image_urls") ||
    Object.prototype.hasOwnProperty.call(s5, "gallery_previews");
  const galleryHasPendingFile =
    Array.isArray(s5.gallery_images) &&
    (s5.gallery_images as unknown[]).some((x) => isSerializedUploadFile(x));
  const galleryExplicitlyCleared = s5.clear_gallery === true;

  if (
    galleryUrlsForStore.length === 0 &&
    !galleryExplicitlyCleared &&
    !galleryHasPendingFile &&
    Array.isArray(prevStoreRow?.gallery_images) &&
    prevStoreRow.gallery_images.length > 0
  ) {
    // Empty/omitted gallery in patch → keep DB gallery (don't wipe on partial Step 5 saves).
    galleryUrlsForStore = prevStoreRow.gallery_images
      .map((u) => normalizeMerchantStoreMediaUrl(String(u).trim()))
      .filter((u): u is string => !!u);
  }

  const mediaKeysToDelete: string[] = [];
  // Only delete R2 on explicit clear. Replacement deletes happen client-side before
  // upload — deleting on every URL change wiped real objects when progress/DB got a
  // stale or test proxy URL.
  const diffMediaClearOnly = (oldVal: unknown, newVal: string | null | undefined) => {
    if (!oldVal || typeof oldVal !== "string") return;
    const oldUrl = oldVal.trim();
    if (!oldUrl) return;
    const newUrl = typeof newVal === "string" ? newVal.trim() : "";
    if (newUrl) return;
    const oldKey = extractR2KeyFromUrl(oldUrl);
    if (oldKey) mediaKeysToDelete.push(oldKey);
  };

  if (prevStoreRow) {
    if (bannerExplicitlyCleared) {
      diffMediaClearOnly(prevStoreRow.banner_url, bannerUrlStored);
    }
    const prevGallery: string[] = Array.isArray(prevStoreRow.gallery_images) ? prevStoreRow.gallery_images : [];
    if (galleryExplicitlyCleared && !galleryHasPendingFile) {
      const newKeys = new Set(
        galleryUrlsForStore
          .map((u) => extractR2KeyFromUrl(u) || (u.includes("://") ? null : u.replace(/^\/+/, "")))
          .filter((k): k is string => !!k)
      );
      for (const url of prevGallery) {
        if (!url || typeof url !== "string") continue;
        const key = extractR2KeyFromUrl(url) || (url.includes("://") ? null : url.replace(/^\/+/, ""));
        if (key && !newKeys.has(key)) mediaKeysToDelete.push(key);
      }
    }
  }

  const cuisineRaw = s5.cuisine_types;
  const hasCuisines = Object.prototype.hasOwnProperty.call(s5, "cuisine_types");
  const cuisine_types = Array.isArray(cuisineRaw)
    ? cuisineRaw.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];

  let prepMin = parseFiniteNumber(s5.avg_preparation_time_minutes);
  if (prepMin == null || prepMin <= 0) prepMin = 30;
  let minOrder = parseFiniteNumber(s5.min_order_amount);
  if (minOrder == null || minOrder < 0) minOrder = 0;
  const hasPrep = Object.prototype.hasOwnProperty.call(s5, "avg_preparation_time_minutes");
  const hasMinOrder = Object.prototype.hasOwnProperty.call(s5, "min_order_amount");
  const hasPureVeg = Object.prototype.hasOwnProperty.call(s5, "is_pure_veg");
  const hasOnlinePay = Object.prototype.hasOwnProperty.call(s5, "accepts_online_payment");
  const hasCash = Object.prototype.hasOwnProperty.call(s5, "accepts_cash");
  const hasDeliveryRadius = Object.prototype.hasOwnProperty.call(s5, "delivery_radius_km");
  const drParsed = parseFiniteNumber(s5.delivery_radius_km);
  const delivery_radius_km =
    drParsed != null
      ? Math.min(MAX_DELIVERY_RADIUS_KM, Math.max(MIN_DELIVERY_RADIUS_KM, drParsed))
      : null;

  const row: Record<string, unknown> = {
    current_onboarding_step: normalizedNextStep,
  };
  if (hasCuisines) row.cuisine_types = cuisine_types;
  if (hasPrep) row.avg_preparation_time_minutes = prepMin;
  if (hasMinOrder) row.min_order_amount = minOrder;
  if (hasDeliveryRadius && delivery_radius_km != null) row.delivery_radius_km = delivery_radius_km;
  if (hasPureVeg) row.is_pure_veg = !!s5.is_pure_veg;
  if (hasOnlinePay) row.accepts_online_payment = s5.accepts_online_payment !== false;
  if (hasCash) row.accepts_cash = s5.accepts_cash !== false;
  if (bannerUrlStored) {
    row.banner_url = bannerUrlStored;
  } else if (bannerExplicitlyCleared) {
    row.banner_url = null;
  }
  if (galleryUrlsForStore.length > 0) {
    row.gallery_images = galleryUrlsForStore;
  } else if (galleryExplicitlyCleared && !galleryHasPendingFile) {
    row.gallery_images = [];
  }

  const { data: updatedStore, error } = await db
    .from("merchant_stores")
    .update(row)
    .eq("id", storeDbId)
    .select("id, banner_url, gallery_images")
    .maybeSingle();
  if (error) {
    console.error("[register-store-progress] merchant_stores step5 sync failed:", error);
    return;
  }
  console.log("[register-store-progress] merchant_stores step5 sync ok", {
    storeDbId,
    banner: !!(updatedStore as any)?.banner_url,
    gallery_n: Array.isArray((updatedStore as any)?.gallery_images)
      ? ((updatedStore as any).gallery_images as unknown[]).length
      : 0,
    wrote_banner: !!bannerUrlStored || bannerExplicitlyCleared,
    wrote_gallery: galleryUrlsForStore.length > 0 || galleryExplicitlyCleared,
    banner_keys_present: bannerKeyPresent,
    gallery_keys_present: galleryKeyPresent,
  });

  for (const key of mediaKeysToDelete) {
    try {
      await deleteFromR2(key);
    } catch (e) {
      console.warn("[register-store-progress] R2 delete store media failed:", key, e);
    }
  }
}

type Step5HoursDay = {
  closed: boolean;
  slot1_open: string;
  slot1_close: string;
  slot2_open: string;
  slot2_close: string;
};

function operatingHoursRowToStoreHours(row: Record<string, unknown>): Record<string, Step5HoursDay> {
  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ] as const;
  const out: Record<string, Step5HoursDay> = {};
  for (const day of days) {
    const open = !!(row as any)[`${day}_open`];
    const s1 = (row as any)[`${day}_slot1_start`];
    const e1 = (row as any)[`${day}_slot1_end`];
    const s2 = (row as any)[`${day}_slot2_start`];
    const e2 = (row as any)[`${day}_slot2_end`];
    const toStr = (v: unknown) => (typeof v === "string" ? v.slice(0, 5) : v != null ? String(v).slice(0, 5) : "");
    out[day] = {
      closed: !open,
      slot1_open: open ? toStr(s1) : "",
      slot1_close: open ? toStr(e1) : "",
      slot2_open: open ? toStr(s2) : "",
      slot2_close: open ? toStr(e2) : "",
    };
  }
  return out;
}

/**
 * Rebuild form_data.step5 from merchant_stores + operating_hours so refresh matches
 * Save & Continue persistence (same pattern as step1/step3/step4 enrichment).
 */
export async function enrichStep5FromMerchantTables(
  db: Step5Supabase,
  storeDbId: number,
  existingStep5: Record<string, unknown> | null | undefined
): Promise<Record<string, unknown>> {
  const prev = existingStep5 && typeof existingStep5 === "object" ? { ...existingStep5 } : {};

  const { data: storeRow } = await db
    .from("merchant_stores")
    .select(
      "banner_url, gallery_images, cuisine_types, delivery_radius_km, avg_preparation_time_minutes, min_order_amount, is_pure_veg, accepts_online_payment, accepts_cash",
    )
    .eq("id", storeDbId)
    .maybeSingle();

  const { data: hoursRow } = await db
    .from("merchant_store_operating_hours")
    .select("*")
    .eq("store_id", storeDbId)
    .maybeSingle();

  if (!storeRow && !hoursRow) return prev;

  const bannerRaw =
    typeof (storeRow as any)?.banner_url === "string" ? (storeRow as any).banner_url.trim() : "";
  const bannerUrl = bannerRaw ? normalizeMerchantStoreMediaUrl(bannerRaw) : null;

  const galleryRaw = Array.isArray((storeRow as any)?.gallery_images)
    ? ((storeRow as any).gallery_images as unknown[])
    : [];
  const galleryUrls = galleryRaw
    .filter((u): u is string => typeof u === "string" && !!u.trim())
    .map((u) => normalizeMerchantStoreMediaUrl(u.trim()))
    .filter((u): u is string => !!u);

  const cuisineFromDb = Array.isArray((storeRow as any)?.cuisine_types)
    ? ((storeRow as any).cuisine_types as unknown[]).filter(
        (c): c is string => typeof c === "string" && c.trim().length > 0,
      )
    : [];
  const cuisineFromPrev = Array.isArray(prev.cuisine_types)
    ? (prev.cuisine_types as unknown[]).filter(
        (c): c is string => typeof c === "string" && c.trim().length > 0,
      )
    : [];

  const storeHoursFromDb = hoursRow
    ? operatingHoursRowToStoreHours(hoursRow as Record<string, unknown>)
    : null;
  const prevHours =
    prev.store_hours && typeof prev.store_hours === "object"
      ? (prev.store_hours as Record<string, unknown>)
      : null;

  return {
    ...prev,
    cuisine_types: cuisineFromDb.length > 0 ? cuisineFromDb : cuisineFromPrev,
    delivery_radius_km:
      typeof (storeRow as any)?.delivery_radius_km === "number" &&
      Number.isFinite((storeRow as any).delivery_radius_km)
        ? (storeRow as any).delivery_radius_km
        : prev.delivery_radius_km,
    avg_preparation_time_minutes:
      typeof (storeRow as any)?.avg_preparation_time_minutes === "number"
        ? (storeRow as any).avg_preparation_time_minutes
        : prev.avg_preparation_time_minutes,
    min_order_amount:
      typeof (storeRow as any)?.min_order_amount === "number"
        ? (storeRow as any).min_order_amount
        : prev.min_order_amount,
    is_pure_veg:
      typeof (storeRow as any)?.is_pure_veg === "boolean"
        ? (storeRow as any).is_pure_veg
        : prev.is_pure_veg,
    accepts_online_payment:
      typeof (storeRow as any)?.accepts_online_payment === "boolean"
        ? (storeRow as any).accepts_online_payment
        : prev.accepts_online_payment,
    accepts_cash:
      typeof (storeRow as any)?.accepts_cash === "boolean"
        ? (storeRow as any).accepts_cash
        : prev.accepts_cash,
    banner_url: bannerUrl || prev.banner_url || "",
    banner_preview: bannerUrl || prev.banner_preview || "",
    gallery_image_urls: galleryUrls.length > 0 ? galleryUrls : prev.gallery_image_urls || [],
    gallery_previews: galleryUrls.length > 0 ? galleryUrls : prev.gallery_previews || [],
    store_hours: storeHoursFromDb || prevHours || prev.store_hours,
  };
}

