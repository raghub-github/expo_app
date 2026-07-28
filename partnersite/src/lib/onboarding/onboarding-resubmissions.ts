/**
 * Partner-side helpers for merchant_store_onboarding_resubmissions staging table.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ResubmissionItemInput = {
  verificationStep: number;
  fieldKey: string;
  payload: Record<string, unknown>;
  r2ObjectKey?: string | null;
  proxyUrl?: string | null;
};

/**
 * Upsert pending resubmission rows (one pending per store/step/field).
 * Supersedes any previous pending row for the same key by marking it discarded.
 * Supports multi-time resubmit after admin re-rejects without verifying.
 */
export async function upsertPendingOnboardingResubmissions(
  db: SupabaseClient,
  params: {
    storeDbId: number;
    parentId?: number | null;
    authUserId?: string | null;
    items: ResubmissionItemInput[];
  }
): Promise<{ saved: number }> {
  const { storeDbId, parentId = null, authUserId = null, items } = params;
  if (!Number.isFinite(storeDbId) || storeDbId <= 0 || items.length === 0) {
    return { saved: 0 };
  }

  let saved = 0;
  for (const item of items) {
    const step = Math.floor(Number(item.verificationStep));
    const fieldKey = String(item.fieldKey || "").trim();
    if (!Number.isFinite(step) || step < 1 || step > 8 || !fieldKey) continue;

    // Discard previous pending for same key (unique index only allows one pending)
    await db
      .from("merchant_store_onboarding_resubmissions")
      .update({
        status: "discarded",
        discarded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("store_id", storeDbId)
      .eq("verification_step", step)
      .eq("field_key", fieldKey)
      .eq("status", "pending");

    let cycleNumber = 1;
    try {
      const { data: cycleRows } = await db
        .from("merchant_store_onboarding_resubmissions")
        .select("cycle_number")
        .eq("store_id", storeDbId)
        .eq("verification_step", step)
        .eq("field_key", fieldKey)
        .order("cycle_number", { ascending: false })
        .limit(1);
      const maxCycle = Number(cycleRows?.[0]?.cycle_number ?? 0);
      cycleNumber = Number.isFinite(maxCycle) && maxCycle > 0 ? maxCycle + 1 : 1;
    } catch {
      cycleNumber = 1;
    }

    const baseRow = {
      store_id: storeDbId,
      parent_id: parentId,
      verification_step: step,
      field_key: fieldKey,
      payload: item.payload || {},
      r2_object_key: item.r2ObjectKey ?? null,
      proxy_url: item.proxyUrl ?? null,
      status: "pending",
      submitted_at: new Date().toISOString(),
      submitted_by_auth_user_id: authUserId,
      updated_at: new Date().toISOString(),
    };

    let { error } = await db.from("merchant_store_onboarding_resubmissions").insert({
      ...baseRow,
      cycle_number: cycleNumber,
    });

    if (error && /cycle_number/i.test(error.message || "")) {
      ({ error } = await db.from("merchant_store_onboarding_resubmissions").insert(baseRow));
    }

    if (error) {
      console.warn("[upsertPendingOnboardingResubmissions]", fieldKey, error.message);
      continue;
    }
    saved += 1;
  }

  return { saved };
}

/** Mark step4_resubmission_flags so admin verify gate unlocks without overwriting live URLs. */
export async function markDocumentResubmissionFlags(
  db: SupabaseClient,
  storeDbId: number,
  docKeys: string[]
): Promise<void> {
  if (!storeDbId || docKeys.length === 0) return;
  const { data: existing } = await db
    .from("merchant_store_documents")
    .select("step4_resubmission_flags")
    .eq("store_id", storeDbId)
    .maybeSingle();

  const flags: Record<string, unknown> =
    existing?.step4_resubmission_flags &&
    typeof existing.step4_resubmission_flags === "object" &&
    existing.step4_resubmission_flags !== null
      ? { ...(existing.step4_resubmission_flags as Record<string, unknown>) }
      : {};

  for (const k of docKeys) {
    flags[k] = true;
  }

  await db.from("merchant_store_documents").upsert(
    {
      store_id: storeDbId,
      step4_resubmission_flags: flags,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "store_id" }
  );
}

const DOC_FIELD_KEYS = new Set([
  "pan",
  "gst",
  "aadhaar",
  "fssai",
  "bank_proof",
  "drug_license",
  "trade_license",
  "shop_establishment",
  "udyam",
  "pharmacist_certificate",
  "pharmacy_council_registration",
  "other",
]);

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

export type LastResubmissionRow = {
  field_key: string;
  payload: Record<string, unknown>;
  proxy_url?: string | null;
  r2_object_key?: string | null;
  status?: string;
};

/** Latest discarded resubmit per field — shown as Rejected after admin re-reject. */
export async function listLastResubmissionSnapshots(
  db: SupabaseClient,
  storeDbId: number
): Promise<LastResubmissionRow[]> {
  if (!Number.isFinite(storeDbId) || storeDbId <= 0) return [];
  try {
    const { data, error } = await db
      .from("merchant_store_onboarding_resubmissions")
      .select("field_key, payload, proxy_url, r2_object_key, status, submitted_at, id")
      .eq("store_id", storeDbId)
      .eq("status", "discarded")
      .order("submitted_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(200);
    if (error) {
      console.warn("[listLastResubmissionSnapshots]", error.message);
      return [];
    }
    const seen = new Set<string>();
    const out: LastResubmissionRow[] = [];
    for (const row of data ?? []) {
      const key = String((row as { field_key?: string }).field_key || "").trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push({
        field_key: key,
        payload: asRecord((row as { payload?: unknown }).payload),
        proxy_url:
          (row as { proxy_url?: string | null }).proxy_url != null
            ? String((row as { proxy_url: string }).proxy_url)
            : null,
        r2_object_key:
          (row as { r2_object_key?: string | null }).r2_object_key != null
            ? String((row as { r2_object_key: string }).r2_object_key)
            : null,
        status: String((row as { status?: string }).status || "discarded"),
      });
    }
    return out;
  } catch (e) {
    console.warn("[listLastResubmissionSnapshots]", e);
    return [];
  }
}

export function flattenLastResubmissionOldValues(
  rows: LastResubmissionRow[]
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const key = row.field_key;
    const payload = row.payload;
    if (key === "banner_url") {
      const fromKey = str(row.r2_object_key);
      const url =
        (fromKey ? fromKey : null) ||
        str(payload.banner_url) ||
        str(row.proxy_url) ||
        str(payload.proxy_url) ||
        "";
      if (url) out.banner_url = url;
      if (fromKey) out.banner_r2_key = fromKey;
      continue;
    }
    if (DOC_FIELD_KEYS.has(key)) {
      const num =
        str(payload.document_number) ||
        str(payload[`${key}_document_number`]) ||
        str(payload[`${key}_number`]) ||
        str(payload.fssai_number) ||
        str(payload.pan_number) ||
        str(payload.gst_number) ||
        str(payload.aadhar_number) ||
        "";
      const url =
        str(payload.document_url) ||
        str(payload.proxy_url) ||
        str(row.proxy_url) ||
        str(payload[`${key}_document_url`]) ||
        str(payload[`${key}_image_url`]) ||
        "";
      const expiry =
        str(payload.expiry_date) ||
        str(payload.fssai_expiry_date) ||
        str(payload[`${key}_expiry_date`]) ||
        "";
      if (key === "pan") {
        if (num) out.pan_number = num;
        if (url) out.pan_image_url = url;
      } else if (key === "aadhaar") {
        if (num) out.aadhar_number = num;
        if (url) out.aadhar_front_url = url;
      } else if (key === "fssai") {
        if (num) out.fssai_number = num;
        if (url) out.fssai_image_url = url;
        if (expiry) out.fssai_expiry_date = expiry;
      } else if (key === "gst") {
        if (num) out.gst_number = num;
        if (url) out.gst_image_url = url;
      } else if (key === "bank_proof") {
        if (url) out.bank_proof_file_url = url;
      }
      continue;
    }
    if (key === "store_phones") {
      const raw = payload.store_phones;
      if (Array.isArray(raw)) {
        const joined = raw.map((x) => String(x).trim()).filter(Boolean).join(", ");
        if (joined) out.store_phones = joined;
      } else {
        const v = str(payload.store_phones);
        if (v) out.store_phones = v;
      }
      continue;
    }
    if (key === "store_type") {
      const v = str(payload.store_type);
      if (v) out.store_type = v;
      const custom = str(payload.custom_store_type);
      if (custom) out.custom_store_type = custom;
      continue;
    }
    if (key === "map_location") {
      const lat = str(payload.latitude ?? payload.lat);
      const lng = str(payload.longitude ?? payload.lng ?? payload.lon);
      if (lat) out.latitude = lat;
      if (lng) out.longitude = lng;
      continue;
    }
    const v = str(payload[key]);
    if (v) out[key] = v;
  }
  return out;
}
