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
  const fullAddressLine =
    typeof step2.full_address === "string" ? step2.full_address.trim() || null : null;
  const unit_number =
    typeof step2.unit_number === "string" ? step2.unit_number.trim() || null : null;
  const floor_number =
    typeof step2.floor_number === "string" ? step2.floor_number.trim() || null : null;
  const building_name =
    typeof step2.building_name === "string" ? step2.building_name.trim() || null : null;

  // AM "Full Address" is a multi-part address. Persist a single readable
  // value in merchant_stores.full_address by concatenating:
  // Flat/Unit No. -> Floor/Tower -> Building/Complex Name -> Full Address
  const full_address_combined = [unit_number, floor_number, building_name, fullAddressLine]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(", ");
  const full_address = full_address_combined.trim().length > 0 ? full_address_combined : null;
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
  const normalizeStoredMediaUrl = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    // Never save local preview/blob/data URLs in DB.
    if (trimmed.startsWith("data:") || trimmed.startsWith("blob:")) return null;

    if (trimmed.startsWith("/api/attachments/proxy")) return trimmed;
    if (trimmed.startsWith("/v1/attachments/proxy")) {
      return trimmed.replace("/v1/attachments/proxy", "/api/attachments/proxy");
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const u = new URL(trimmed);
        if (u.pathname.startsWith("/api/attachments/proxy") || u.pathname.startsWith("/v1/attachments/proxy")) {
          const key = u.searchParams.get("key");
          if (key && key.trim()) {
            return `/api/attachments/proxy?key=${encodeURIComponent(key.trim())}`;
          }
        }
      } catch {
        return null;
      }
      return null;
    }

    // Treat plain value as raw R2 key.
    return `/api/attachments/proxy?key=${encodeURIComponent(trimmed.replace(/^\/+/, ""))}`;
  };

  const bannerUrlRaw = (step5 as any).banner_url;
  const bannerUrl = normalizeStoredMediaUrl(bannerUrlRaw);

  const galleryRaw = (step5 as any).gallery_image_urls;
  const galleryImages =
    Array.isArray(galleryRaw) && galleryRaw.length
      ? (galleryRaw as unknown[])
          .map((u) => normalizeStoredMediaUrl(u))
          .filter((u): u is string => typeof u === "string" && u.length > 0)
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

  const deliveryRadiusRaw = (step5 as any).delivery_radius_km;
  const hasDeliveryRadius = Object.prototype.hasOwnProperty.call(step5, "delivery_radius_km");
  const deliveryRadiusNum =
    typeof deliveryRadiusRaw === "number"
      ? deliveryRadiusRaw
      : typeof deliveryRadiusRaw === "string" && deliveryRadiusRaw.trim().length > 0
        ? Number(deliveryRadiusRaw)
        : null;
  const canUpdateDeliveryRadius =
    hasDeliveryRadius &&
    deliveryRadiusNum != null &&
    Number.isFinite(deliveryRadiusNum) &&
    deliveryRadiusNum >= 1 &&
    deliveryRadiusNum <= 50;
  const delivery_radius_km = canUpdateDeliveryRadius ? deliveryRadiusNum : null;

  const operatingHoursRaw = (step5 as any).store_hours;
  const hasOperatingHours =
    operatingHoursRaw && typeof operatingHoursRaw === "object";

  if (!hasBanner && !hasGallery && !hasCuisines && !canUpdateDeliveryRadius && !hasOperatingHours) return;

  if (hasBanner || hasGallery || hasCuisines || canUpdateDeliveryRadius) {
    await sql`
      UPDATE merchant_stores
      SET
        ${hasBanner ? sql`banner_url = ${bannerUrl},` : sql``}
        ${hasGallery ? sql`gallery_images = ${galleryImages}::text[],` : sql``}
        ${hasCuisines ? sql`cuisine_types = ${cuisineTypes}::text[],` : sql``}
        ${canUpdateDeliveryRadius ? sql`delivery_radius_km = ${delivery_radius_km},` : sql``}
        updated_at = NOW()
      WHERE id = ${storeInternalId}
    `;
  }

  if (hasOperatingHours) {
    type StoreHoursDay = {
      closed?: boolean;
      slot1_open?: string;
      slot1_close?: string;
      slot2_open?: string;
      slot2_close?: string;
    };

    const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

    const normalizeHHmm = (v: unknown): string | null => {
      if (v == null) return null;
      if (typeof v !== "string") return null;
      const s = v.trim().slice(0, 5);
      if (!/^\d{1,2}:\d{2}$/.test(s)) return null;
      const [hh, mm] = s.split(":");
      const h = Number(hh);
      const m = Number(mm);
      if (!Number.isFinite(h) || !Number.isFinite(m) || m < 0 || m > 59) return null;
      const hh2 = String(h).padStart(2, "0");
      const mm2 = String(m).padStart(2, "0");
      return `${hh2}:${mm2}`;
    };

    const timeToMinutes = (v: string | null): number | null => {
      if (!v) return null;
      const [h, m] = v.split(":").map((n) => Number(n));
      if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
      return h * 60 + m;
    };

    const timeGt = (end: string | null, start: string | null): boolean => {
      const e = timeToMinutes(end);
      const s = timeToMinutes(start);
      if (e == null || s == null) return false;
      return e > s;
    };

    const normalizeDay = (day: StoreHoursDay): {
      open: boolean;
      s1Start: string | null;
      s1End: string | null;
      s2Start: string | null;
      s2End: string | null;
    } => {
      const open = !day.closed;
      if (!open) {
        return { open: false, s1Start: null, s1End: null, s2Start: null, s2End: null };
      }

      const s1Start = normalizeHHmm(day.slot1_open);
      const s1End = normalizeHHmm(day.slot1_close);
      // Validate slot1 ordering
      const validS1 = s1Start != null && s1End != null && timeGt(s1End, s1Start);
      const ns1Start = validS1 ? s1Start : null;
      const ns1End = validS1 ? s1End : null;

      const rawS2Start = normalizeHHmm(day.slot2_open);
      const rawS2End = normalizeHHmm(day.slot2_close);
      // Slot2 must be provided as a pair (both non-null) or treated as absent
      let ns2Start: string | null = null;
      let ns2End: string | null = null;
      const hasS2Pair = rawS2Start != null && rawS2End != null;
      if (hasS2Pair) {
        // Validate slot2 ordering itself
        if (timeGt(rawS2End, rawS2Start)) {
          // Validate against slot1 to satisfy DB constraints
          const s1EndGt = ns1End == null || timeGt(rawS2Start, ns1End);
          const s1StartGt = ns1Start == null || timeGt(rawS2End, ns1Start);
          if (s1EndGt && s1StartGt) {
            ns2Start = rawS2Start;
            ns2End = rawS2End;
          }
        }
      }

      return { open: true, s1Start: ns1Start, s1End: ns1End, s2Start: ns2Start, s2End: ns2End };
    };

    const oh = operatingHoursRaw as Record<string, unknown>;

    const dayValues = DAYS.map((d) => normalizeDay(oh[d] as StoreHoursDay));

    const sameForAllDays =
      dayValues.every((v, i) => {
        const m = dayValues[0];
        return i === 0 || (v.open === m.open && v.s1Start === m.s1Start && v.s1End === m.s1End && v.s2Start === m.s2Start && v.s2End === m.s2End);
      });

    const is24Hours =
      dayValues.every((v) => v.open && v.s1Start === "00:00" && v.s1End === "23:59" && v.s2Start == null && v.s2End == null);

    // closed_days is derived by DB trigger from *_open flags, so we can keep it null.
    await sql`
      INSERT INTO merchant_store_operating_hours (
        store_id, same_for_all_days, is_24_hours, closed_days,
        monday_open, monday_slot1_start, monday_slot1_end, monday_slot2_start, monday_slot2_end,
        tuesday_open, tuesday_slot1_start, tuesday_slot1_end, tuesday_slot2_start, tuesday_slot2_end,
        wednesday_open, wednesday_slot1_start, wednesday_slot1_end, wednesday_slot2_start, wednesday_slot2_end,
        thursday_open, thursday_slot1_start, thursday_slot1_end, thursday_slot2_start, thursday_slot2_end,
        friday_open, friday_slot1_start, friday_slot1_end, friday_slot2_start, friday_slot2_end,
        saturday_open, saturday_slot1_start, saturday_slot1_end, saturday_slot2_start, saturday_slot2_end,
        sunday_open, sunday_slot1_start, sunday_slot1_end, sunday_slot2_start, sunday_slot2_end
      )
      VALUES (
        ${storeInternalId}, ${sameForAllDays}, ${is24Hours}, ${null},
        ${dayValues[0].open}, ${dayValues[0].s1Start}, ${dayValues[0].s1End}, ${dayValues[0].s2Start}, ${dayValues[0].s2End},
        ${dayValues[1].open}, ${dayValues[1].s1Start}, ${dayValues[1].s1End}, ${dayValues[1].s2Start}, ${dayValues[1].s2End},
        ${dayValues[2].open}, ${dayValues[2].s1Start}, ${dayValues[2].s1End}, ${dayValues[2].s2Start}, ${dayValues[2].s2End},
        ${dayValues[3].open}, ${dayValues[3].s1Start}, ${dayValues[3].s1End}, ${dayValues[3].s2Start}, ${dayValues[3].s2End},
        ${dayValues[4].open}, ${dayValues[4].s1Start}, ${dayValues[4].s1End}, ${dayValues[4].s2Start}, ${dayValues[4].s2End},
        ${dayValues[5].open}, ${dayValues[5].s1Start}, ${dayValues[5].s1End}, ${dayValues[5].s2Start}, ${dayValues[5].s2End},
        ${dayValues[6].open}, ${dayValues[6].s1Start}, ${dayValues[6].s1End}, ${dayValues[6].s2Start}, ${dayValues[6].s2End}
      )
      ON CONFLICT (store_id) DO UPDATE SET
        same_for_all_days = EXCLUDED.same_for_all_days,
        is_24_hours = EXCLUDED.is_24_hours,
        closed_days = EXCLUDED.closed_days,
        monday_open = EXCLUDED.monday_open, monday_slot1_start = EXCLUDED.monday_slot1_start, monday_slot1_end = EXCLUDED.monday_slot1_end, monday_slot2_start = EXCLUDED.monday_slot2_start, monday_slot2_end = EXCLUDED.monday_slot2_end,
        tuesday_open = EXCLUDED.tuesday_open, tuesday_slot1_start = EXCLUDED.tuesday_slot1_start, tuesday_slot1_end = EXCLUDED.tuesday_slot1_end, tuesday_slot2_start = EXCLUDED.tuesday_slot2_start, tuesday_slot2_end = EXCLUDED.tuesday_slot2_end,
        wednesday_open = EXCLUDED.wednesday_open, wednesday_slot1_start = EXCLUDED.wednesday_slot1_start, wednesday_slot1_end = EXCLUDED.wednesday_slot1_end, wednesday_slot2_start = EXCLUDED.wednesday_slot2_start, wednesday_slot2_end = EXCLUDED.wednesday_slot2_end,
        thursday_open = EXCLUDED.thursday_open, thursday_slot1_start = EXCLUDED.thursday_slot1_start, thursday_slot1_end = EXCLUDED.thursday_slot1_end, thursday_slot2_start = EXCLUDED.thursday_slot2_start, thursday_slot2_end = EXCLUDED.thursday_slot2_end,
        friday_open = EXCLUDED.friday_open, friday_slot1_start = EXCLUDED.friday_slot1_start, friday_slot1_end = EXCLUDED.friday_slot1_end, friday_slot2_start = EXCLUDED.friday_slot2_start, friday_slot2_end = EXCLUDED.friday_slot2_end,
        saturday_open = EXCLUDED.saturday_open, saturday_slot1_start = EXCLUDED.saturday_slot1_start, saturday_slot1_end = EXCLUDED.saturday_slot1_end, saturday_slot2_start = EXCLUDED.saturday_slot2_start, saturday_slot2_end = EXCLUDED.saturday_slot2_end,
        sunday_open = EXCLUDED.sunday_open, sunday_slot1_start = EXCLUDED.sunday_slot1_start, sunday_slot1_end = EXCLUDED.sunday_slot1_end, sunday_slot2_start = EXCLUDED.sunday_slot2_start, sunday_slot2_end = EXCLUDED.sunday_slot2_end,
        updated_at = NOW()
    `;
  }
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
