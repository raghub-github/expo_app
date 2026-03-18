/**
 * Child store onboarding progress (merchant_store_registration_progress).
 * Used by area manager add-child flow; steps 1–10, form_data JSONB.
 *
 * Same store record and step logic as Partner Site (register-store-progress):
 * - One progress row per (parent_id, store_id). AM and merchant complete steps on the same store.
 * - Step 1/2: synced to merchant_stores (owner_full_name, address, current_onboarding_step).
 * - Steps 3–10 (menu, documents, bank, operational, agreement, final review): when implemented in dashboard,
 *   persist to the same tables (merchant_store_documents, merchant_store_bank_accounts,
 *   merchant_store_media_files, merchant_store_operating_hours) and form_data so Partner
 *   GET shows completed/pending and merchant can sign agreement for this store.
 */

import { getSql } from "../client";

export interface ChildStoreProgressRow {
  id: number;
  parent_id: number;
  store_id: number | null;
  current_step: number;
  total_steps: number | null;
  form_data: Record<string, unknown> | null;
}

/**
 * Get progress row by parent_id and store_id (merchant_stores.id). Returns null if not found.
 */
export async function getChildStoreProgress(
  parentId: number,
  storeInternalId: number
): Promise<ChildStoreProgressRow | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, parent_id, store_id, current_step, total_steps, form_data
    FROM merchant_store_registration_progress
    WHERE parent_id = ${parentId} AND store_id = ${storeInternalId}
    LIMIT 1
  `;
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row ? (row as ChildStoreProgressRow) : null;
}

/**
 * Sync step 2 (address/location) to merchant_stores so Partner Site and AM flow use the same store record.
 * Same fields as Partner Site upsertStoreDraft (address part).
 */
async function syncStep2ToMerchantStores(
  sql: ReturnType<typeof getSql>,
  storeInternalId: number,
  step2: Record<string, unknown>
): Promise<void> {
  const full_address =
    typeof step2.full_address === "string" ? step2.full_address.trim() || null : null;
  const city = typeof step2.city === "string" ? step2.city.trim() || null : null;
  const state = typeof step2.state === "string" ? step2.state.trim() || null : null;
  const postal_code =
    typeof step2.postal_code === "string" ? step2.postal_code.trim() || null : null;
  const country =
    typeof step2.country === "string" && step2.country.trim()
      ? step2.country.trim()
      : "IN";
  const landmark =
    typeof step2.landmark === "string" ? step2.landmark.trim() || null : null;

  const latRaw =
    typeof step2.latitude === "number"
      ? step2.latitude
      : typeof step2.latitude === "string"
      ? Number(step2.latitude)
      : null;
  const lngRaw =
    typeof step2.longitude === "number"
      ? step2.longitude
      : typeof step2.longitude === "string"
      ? Number(step2.longitude)
      : null;
  const lat = Number.isFinite(latRaw as number) ? (latRaw as number) : null;
  const lng = Number.isFinite(lngRaw as number) ? (lngRaw as number) : null;

  // Always attempt to sync step2 to merchant_stores; rely on NOT NULL constraints to surface issues.
  await sql`
    UPDATE merchant_stores
    SET
      full_address = COALESCE(${full_address}, full_address),
      landmark = COALESCE(${landmark}, landmark),
      city = COALESCE(${city}, city),
      state = COALESCE(${state}, state),
      postal_code = COALESCE(${postal_code}, postal_code),
      country = COALESCE(${country}, country),
      latitude = ${lat},
      longitude = ${lng},
      updated_at = NOW()
    WHERE id = ${storeInternalId}
  `;
}

/**
 * Sync step 5 (operational details: banner, gallery, cuisines) to merchant_stores
 * so AM dashboard child onboarding keeps media fields in sync with Partner Site.
 */
async function syncStep5ToMerchantStores(
  sql: ReturnType<typeof getSql>,
  storeInternalId: number,
  step5: Record<string, unknown>
): Promise<void> {
  const bannerUrlRaw = (step5 as any).banner_url;
  const bannerUrl =
    typeof bannerUrlRaw === "string" && bannerUrlRaw.trim()
      ? bannerUrlRaw.trim()
      : null;

  const galleryRaw = (step5 as any).gallery_image_urls;
  const galleryImages =
    Array.isArray(galleryRaw) && galleryRaw.length
      ? (galleryRaw as unknown[])
          .filter((u) => typeof u === "string" && u.trim())
          .map((u) => (u as string).trim())
      : null;

  const cuisinesRaw = (step5 as any).cuisine_types;
  const cuisineTypes =
    Array.isArray(cuisinesRaw) && cuisinesRaw.length
      ? (cuisinesRaw as unknown[])
          .filter((u) => typeof u === "string" && u.trim())
          .map((u) => (u as string).trim())
      : null;

  // If none of these fields were present on the patch, skip update.
  const hasBanner = Object.prototype.hasOwnProperty.call(step5, "banner_url");
  const hasGallery = Object.prototype.hasOwnProperty.call(step5, "gallery_image_urls");
  const hasCuisines = Object.prototype.hasOwnProperty.call(step5, "cuisine_types");
  if (!hasBanner && !hasGallery && !hasCuisines) return;

  await sql`
    UPDATE merchant_stores
    SET
      ${hasBanner ? sql`banner_url = ${bannerUrl},` : sql``}
      ${hasGallery ? sql`gallery_images = ${galleryImages}::text[],` : sql``}
      ${hasCuisines ? sql`cuisine_types = ${cuisineTypes}::text[],` : sql``}
      updated_at = NOW()
    WHERE id = ${storeInternalId}
  `;
}

/**
 * Upsert progress: set current_step and merge form_data. Creates row if not exists.
 * store_id is merchant_stores.id (internal).
 * When formDataPatch contains step2, syncs address to merchant_stores (same as Partner Site).
 */
export async function upsertChildStoreProgress(params: {
  parentId: number;
  storeInternalId: number;
  currentStep: number;
  formDataPatch?: Record<string, unknown> | null;
}): Promise<{ current_step: number }> {
  const sql = getSql();
  const existing = await getChildStoreProgress(params.parentId, params.storeInternalId);
  const nextStep = Math.min(Math.max(params.currentStep, 1), 10);
  const mergedFormData =
    params.formDataPatch != null && Object.keys(params.formDataPatch).length > 0
      ? deepMerge(
          (existing?.form_data as Record<string, unknown>) || {},
          params.formDataPatch
        )
      : (existing?.form_data as Record<string, unknown>) || {};

  const step2 = mergedFormData?.step2 as Record<string, unknown> | undefined;
  if (step2 && typeof step2 === "object") {
    await syncStep2ToMerchantStores(sql, params.storeInternalId, step2);
  }

  const step5 = mergedFormData?.step5 as Record<string, unknown> | undefined;
  if (step5 && typeof step5 === "object") {
    await syncStep5ToMerchantStores(sql, params.storeInternalId, step5);
  }

  if (existing) {
    await sql`
      UPDATE merchant_store_registration_progress
      SET current_step = ${nextStep}, form_data = ${JSON.stringify(mergedFormData)}::jsonb,
          registration_status = 'IN_PROGRESS', updated_at = NOW()
      WHERE parent_id = ${params.parentId} AND store_id = ${params.storeInternalId}
    `;
  } else {
    await sql`
      INSERT INTO merchant_store_registration_progress (parent_id, store_id, current_step, total_steps, form_data, registration_status)
      VALUES (${params.parentId}, ${params.storeInternalId}, ${nextStep}, 10, ${JSON.stringify(mergedFormData)}::jsonb, 'IN_PROGRESS')
      ON CONFLICT (parent_id, store_id) DO UPDATE SET
        current_step = EXCLUDED.current_step,
        form_data = EXCLUDED.form_data,
        registration_status = 'IN_PROGRESS',
        updated_at = NOW()
    `;
  }
  // Keep merchant_stores.current_onboarding_step in sync (same as Partner Site)
  await sql`
    UPDATE merchant_stores SET current_onboarding_step = ${nextStep}, updated_at = NOW()
    WHERE id = ${params.storeInternalId}
  `;
  return { current_step: nextStep };
}

function deepMerge(
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
      result[key] = deepMerge(
        existing as Record<string, unknown>,
        patchVal as Record<string, unknown>
      );
    } else {
      result[key] = patchVal;
    }
  }
  return result;
}
