/**
 * Promote pending partner onboarding resubmissions into main tables after admin verify.
 * Staging table: merchant_store_onboarding_resubmissions
 *
 * Multi-cycle: reject → resubmit → (optional re-resubmit) → verify → reject again…
 * Only one `pending` row per (store, step, field); older pending is discarded on upsert.
 * Applied/discarded rows are kept as history.
 */
import { getSql } from "@/lib/db/client";
import { deleteR2ObjectForStoredUrl } from "@/lib/r2-proxy-url";
import { profileMediaR2KeyFromUrl } from "@/lib/merchant/store-profile-media";

export type PendingOnboardingResubmission = {
  id: number;
  store_id: number;
  verification_step: number;
  field_key: string;
  payload: Record<string, unknown>;
  r2_object_key: string | null;
  proxy_url: string | null;
  status: string;
};

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t || null;
}

const DOC_FIELD_KEYS = new Set([
  "pan",
  "gst",
  "aadhaar",
  "fssai",
  "drug_license",
  "trade_license",
  "shop_establishment",
  "udyam",
  "pharmacist_certificate",
  "pharmacy_council_registration",
  "bank_proof",
  "other",
]);

function r2KeyFromStored(urlOrKey: string | null | undefined): string | null {
  const raw = str(urlOrKey);
  if (!raw) return null;
  return profileMediaR2KeyFromUrl(raw) || raw.replace(/^\/+/, "") || null;
}

/** Delete old R2 object when replaced by a different key (non-fatal). */
async function deleteReplacedR2Object(
  oldUrlOrKey: string | null | undefined,
  newUrlOrKey: string | null | undefined
): Promise<void> {
  const oldKey = r2KeyFromStored(oldUrlOrKey);
  const newKey = r2KeyFromStored(newUrlOrKey);
  if (!oldKey) return;
  if (newKey && oldKey === newKey) return;
  try {
    await deleteR2ObjectForStoredUrl(oldUrlOrKey);
  } catch (e) {
    console.warn("[onboarding-resubmissions] R2 delete failed:", oldKey, e);
  }
}

export async function listPendingOnboardingResubmissions(
  storeId: number,
  opts?: { verificationStep?: number; fieldKey?: string }
): Promise<PendingOnboardingResubmission[]> {
  const sql = getSql();
  const step = opts?.verificationStep;
  const field = opts?.fieldKey;
  try {
    let rows: Iterable<unknown>;
    if (step != null && field) {
      rows = await sql`
        SELECT id, store_id, verification_step, field_key, payload, r2_object_key, proxy_url, status
        FROM merchant_store_onboarding_resubmissions
        WHERE store_id = ${storeId}
          AND status = 'pending'
          AND verification_step = ${step}
          AND field_key = ${field}
        ORDER BY submitted_at DESC
      `;
    } else if (step != null) {
      rows = await sql`
        SELECT id, store_id, verification_step, field_key, payload, r2_object_key, proxy_url, status
        FROM merchant_store_onboarding_resubmissions
        WHERE store_id = ${storeId}
          AND status = 'pending'
          AND verification_step = ${step}
        ORDER BY submitted_at DESC
      `;
    } else {
      rows = await sql`
        SELECT id, store_id, verification_step, field_key, payload, r2_object_key, proxy_url, status
        FROM merchant_store_onboarding_resubmissions
        WHERE store_id = ${storeId}
          AND status = 'pending'
        ORDER BY submitted_at DESC
      `;
    }
    return Array.from(rows ?? []).map((r) => {
      const o = r as Record<string, unknown>;
      return {
        id: Number(o.id),
        store_id: Number(o.store_id),
        verification_step: Number(o.verification_step),
        field_key: String(o.field_key),
        payload: asRecord(o.payload),
        r2_object_key: o.r2_object_key != null ? String(o.r2_object_key) : null,
        proxy_url: o.proxy_url != null ? String(o.proxy_url) : null,
        status: String(o.status || "pending"),
      };
    });
  } catch (e) {
    console.warn("[listPendingOnboardingResubmissions]", e);
    return [];
  }
}

/**
 * Discard pending for a step (admin re-reject).
 * Keep payload+R2 and return rows for Rejected-column / rejection-detail snapshot.
 */
export async function discardPendingStepResubmissions(
  storeId: number,
  verificationStep: number
): Promise<PendingOnboardingResubmission[]> {
  if (!Number.isFinite(storeId) || storeId <= 0) return [];
  const step = Math.floor(Number(verificationStep));
  if (!Number.isFinite(step) || step < 1 || step > 8) return [];
  const sql = getSql();
  try {
    // Do NOT delete R2 — discarded rows are the source of "last resubmitted" Rejected UI.
    const rows = await sql`
      UPDATE merchant_store_onboarding_resubmissions
      SET status = 'discarded',
          discarded_at = now(),
          updated_at = now()
      WHERE store_id = ${storeId}
        AND verification_step = ${step}
        AND status = 'pending'
      RETURNING id, store_id, verification_step, field_key, payload, r2_object_key, proxy_url, status
    `;
    return (Array.isArray(rows) ? rows : []).map((r) => {
      const o = r as Record<string, unknown>;
      return {
        id: Number(o.id),
        store_id: Number(o.store_id),
        verification_step: Number(o.verification_step),
        field_key: String(o.field_key),
        payload: asRecord(o.payload),
        r2_object_key: o.r2_object_key != null ? String(o.r2_object_key) : null,
        proxy_url: o.proxy_url != null ? String(o.proxy_url) : null,
        status: String(o.status || "discarded"),
      };
    });
  } catch (e) {
    console.warn("[discardPendingStepResubmissions]", e);
    return [];
  }
}

/**
 * Latest discarded resubmit per field_key (after admin re-reject, before next submit).
 * For banner/docs: prefer a history row whose R2 object still exists (skip deleted uploads).
 */
export async function listLastResubmissionSnapshots(
  storeId: number
): Promise<PendingOnboardingResubmission[]> {
  if (!Number.isFinite(storeId) || storeId <= 0) return [];
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT
        id, store_id, verification_step, field_key, payload, r2_object_key, proxy_url, status
      FROM merchant_store_onboarding_resubmissions
      WHERE store_id = ${storeId}
        AND status = 'discarded'
      ORDER BY submitted_at DESC NULLS LAST, id DESC
      LIMIT 200
    `;
    const list = (Array.isArray(rows) ? rows : []).map((r) => {
      const o = r as Record<string, unknown>;
      return {
        id: Number(o.id),
        store_id: Number(o.store_id),
        verification_step: Number(o.verification_step),
        field_key: String(o.field_key),
        payload: asRecord(o.payload),
        r2_object_key: o.r2_object_key != null ? String(o.r2_object_key) : null,
        proxy_url: o.proxy_url != null ? String(o.proxy_url) : null,
        status: String(o.status || "discarded"),
      } satisfies PendingOnboardingResubmission;
    });

    const byField = new Map<string, PendingOnboardingResubmission[]>();
    for (const row of list) {
      const key = row.field_key;
      if (!key) continue;
      const arr = byField.get(key) || [];
      arr.push(row);
      byField.set(key, arr);
    }

    const mediaKeys = new Set(["banner_url", ...DOC_FIELD_KEYS]);
    let r2Exists: ((key: string) => Promise<boolean>) | null = null;
    try {
      const mod = await import("@/lib/services/r2");
      r2Exists = (key: string) => mod.r2ObjectExists(key);
    } catch {
      r2Exists = null;
    }

    const out: PendingOnboardingResubmission[] = [];
    for (const [fieldKey, candidates] of byField) {
      let chosen = candidates[0];
      if (mediaKeys.has(fieldKey) && r2Exists) {
        for (const row of candidates) {
          const candidateKey =
            str(row.r2_object_key) ||
            str(row.proxy_url) ||
            str(row.payload.banner_url) ||
            str(row.payload.document_url) ||
            str(row.payload.proxy_url);
          if (!candidateKey) continue;
          if (await r2Exists(candidateKey)) {
            chosen = row;
            break;
          }
        }
      }
      if (chosen) out.push(chosen);
    }
    return out;
  } catch (e) {
    console.warn("[listLastResubmissionSnapshots]", e);
    return [];
  }
}

/** Flatten last-resubmit rows into a field → display value / url map for Old column. */
export function flattenLastResubmissionOldValues(
  rows: PendingOnboardingResubmission[]
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

async function markApplied(
  ids: number[],
  appliedBySystemUserId: number | null
): Promise<void> {
  if (ids.length === 0) return;
  const sql = getSql();
  for (const id of ids) {
    await sql`
      UPDATE merchant_store_onboarding_resubmissions
      SET status = 'applied',
          applied_at = now(),
          applied_by_system_user_id = ${appliedBySystemUserId},
          updated_at = now()
      WHERE id = ${id}
        AND status = 'pending'
    `;
  }
}

async function readDocUrl(storeId: number, fieldKey: string): Promise<string | null> {
  const sql = getSql();
  try {
    if (fieldKey === "bank_proof") {
      const rows = await sql`
        SELECT bank_proof_file_url AS url
        FROM merchant_store_bank_accounts
        WHERE store_id = ${storeId} AND is_active = true
        ORDER BY id DESC
        LIMIT 1
      `;
      const row = Array.isArray(rows) ? rows[0] : rows;
      return str((row as { url?: unknown } | null)?.url);
    }
    const col =
      fieldKey === "fssai"
        ? "fssai_document_url"
        : fieldKey === "pan"
          ? "pan_document_url"
          : fieldKey === "gst"
            ? "gst_document_url"
            : fieldKey === "aadhaar"
              ? "aadhaar_document_url"
              : null;
    if (!col) return null;
    const sqlAny = sql as {
      unsafe?: (query: string, parameters?: unknown[]) => Promise<unknown[]>;
    };
    if (typeof sqlAny.unsafe !== "function") return null;
    const rows = await sqlAny.unsafe(
      `SELECT ${col} AS url FROM merchant_store_documents WHERE store_id = $1 LIMIT 1`,
      [storeId]
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    return str((row as { url?: unknown } | null)?.url);
  } catch {
    return null;
  }
}

async function readBannerUrl(storeId: number): Promise<string | null> {
  const sql = getSql();
  try {
    const rows = await sql`
      SELECT banner_url FROM merchant_stores WHERE id = ${storeId} LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : rows;
    return str((row as { banner_url?: unknown } | null)?.banner_url);
  } catch {
    return null;
  }
}

/** Apply one document-type pending row into merchant_store_documents (replaces live + clears old R2). */
async function applyDocumentResubmission(
  storeId: number,
  fieldKey: string,
  payload: Record<string, unknown>,
  proxyUrl: string | null
): Promise<void> {
  const sql = getSql();
  const url =
    str(payload.document_url) ||
    str(payload.proxy_url) ||
    proxyUrl ||
    str(payload[`${fieldKey}_document_url`]) ||
    str(payload[`${fieldKey}_image_url`]) ||
    null;
  const number =
    str(payload.document_number) ||
    str(payload[`${fieldKey}_document_number`]) ||
    str(payload[`${fieldKey}_number`]) ||
    str(payload.fssai_number) ||
    str(payload.pan_number) ||
    str(payload.gst_number) ||
    str(payload.aadhar_number) ||
    null;
  const expiry =
    str(payload.expiry_date) ||
    str(payload.fssai_expiry_date) ||
    str(payload[`${fieldKey}_expiry_date`]) ||
    null;

  const previousUrl = await readDocUrl(storeId, fieldKey);

  await sql`
    INSERT INTO merchant_store_documents (store_id)
    VALUES (${storeId})
    ON CONFLICT (store_id) DO NOTHING
  `;

  if (fieldKey === "fssai") {
    await sql`
      UPDATE merchant_store_documents SET
        fssai_document_url = COALESCE(${url}, fssai_document_url),
        fssai_document_number = COALESCE(${number}, fssai_document_number),
        fssai_expiry_date = COALESCE(${expiry}::date, fssai_expiry_date),
        updated_at = now()
      WHERE store_id = ${storeId}
    `;
  } else if (fieldKey === "pan") {
    await sql`
      UPDATE merchant_store_documents SET
        pan_document_url = COALESCE(${url}, pan_document_url),
        pan_document_number = COALESCE(${number}, pan_document_number),
        updated_at = now()
      WHERE store_id = ${storeId}
    `;
  } else if (fieldKey === "gst") {
    await sql`
      UPDATE merchant_store_documents SET
        gst_document_url = COALESCE(${url}, gst_document_url),
        gst_document_number = COALESCE(${number}, gst_document_number),
        updated_at = now()
      WHERE store_id = ${storeId}
    `;
  } else if (fieldKey === "aadhaar") {
    await sql`
      UPDATE merchant_store_documents SET
        aadhaar_document_url = COALESCE(${url}, aadhaar_document_url),
        aadhaar_document_number = COALESCE(${number}, aadhaar_document_number),
        updated_at = now()
      WHERE store_id = ${storeId}
    `;
  } else if (fieldKey === "bank_proof") {
    await sql`
      UPDATE merchant_store_bank_accounts SET
        bank_proof_file_url = COALESCE(${url}, bank_proof_file_url),
        updated_at = now()
      WHERE store_id = ${storeId}
        AND is_active = true
    `;
  } else {
    const urlCol = `${fieldKey}_document_url`;
    const numCol = `${fieldKey}_document_number`;
    try {
      const sqlAny = sql as {
        unsafe?: (query: string, parameters?: unknown[]) => Promise<unknown[]>;
      };
      if (typeof sqlAny.unsafe === "function") {
        await sqlAny.unsafe(
          `UPDATE merchant_store_documents SET
            ${urlCol} = COALESCE($1, ${urlCol}),
            ${numCol} = COALESCE($2, ${numCol}),
            updated_at = now()
          WHERE store_id = $3`,
          [url, number, storeId]
        );
      }
    } catch (e) {
      console.warn(`[applyDocumentResubmission] generic ${fieldKey}:`, e);
    }
  }

  if (url) {
    await deleteReplacedR2Object(previousUrl, url);
  }
}

async function applyStoreFieldResubmission(
  storeId: number,
  fieldKey: string,
  payload: Record<string, unknown>,
  proxyUrl: string | null
): Promise<void> {
  const sql = getSql();
  if (fieldKey === "banner_url") {
    const url = str(payload.banner_url) || proxyUrl || str(payload.proxy_url);
    if (!url) return;
    const previousUrl = await readBannerUrl(storeId);
    await sql`
      UPDATE merchant_stores SET
        banner_url = ${url},
        updated_at = now()
      WHERE id = ${storeId}
    `;
    await deleteReplacedR2Object(previousUrl, url);
    return;
  }

  if (fieldKey === "gallery_images") {
    // Prefer explicit URL list from resubmit payload; otherwise skip silent overwrite.
    const urls = Array.isArray(payload.gallery_images)
      ? (payload.gallery_images as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
      : Array.isArray(payload.urls)
        ? (payload.urls as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
        : [];
    if (urls.length === 0) return;
    await sql`
      UPDATE merchant_stores SET
        gallery_images = ${urls},
        updated_at = now()
      WHERE id = ${storeId}
    `;
    return;
  }

  // Ack / meta keys — no live column
  if (fieldKey.startsWith("step_") && fieldKey.endsWith("_ack")) {
    return;
  }

  const value = str(payload[fieldKey]) || str(payload.document_number);
  if (!value && fieldKey !== "store_phones") return;

  if (fieldKey === "store_name") {
    await sql`UPDATE merchant_stores SET store_name = ${value}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "store_display_name") {
    await sql`UPDATE merchant_stores SET store_display_name = ${value}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "owner_full_name") {
    await sql`UPDATE merchant_stores SET owner_full_name = ${value}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "store_email") {
    await sql`UPDATE merchant_stores SET store_email = ${value}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "store_description") {
    await sql`UPDATE merchant_stores SET store_description = ${value}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "store_type") {
    const customRaw = payload.custom_store_type;
    const custom =
      customRaw == null
        ? null
        : String(customRaw).trim() || null;
    await sql`
      UPDATE merchant_stores SET
        store_type = ${value},
        custom_store_type = ${value === "OTHERS" ? custom : null},
        updated_at = now()
      WHERE id = ${storeId}
    `;
    return;
  }
  if (fieldKey === "store_phones") {
    const phones = value
      ? value.split(/[,|]/).map((p) => p.trim()).filter(Boolean)
      : [];
    await sql`UPDATE merchant_stores SET store_phones = ${phones}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "full_address") {
    await sql`UPDATE merchant_stores SET full_address = ${value}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "landmark") {
    await sql`UPDATE merchant_stores SET landmark = ${value}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "city") {
    await sql`UPDATE merchant_stores SET city = ${value}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "state") {
    await sql`UPDATE merchant_stores SET state = ${value}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "postal_code") {
    await sql`UPDATE merchant_stores SET postal_code = ${value}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "map_location") {
    const lat = Number(payload.latitude ?? payload.lat);
    const lng = Number(payload.longitude ?? payload.lng ?? payload.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    await sql`
      UPDATE merchant_stores SET
        latitude = ${lat},
        longitude = ${lng},
        updated_at = now()
      WHERE id = ${storeId}
    `;
    return;
  }
  if (fieldKey === "latitude" || fieldKey === "longitude") {
    const lat = Number(payload.latitude ?? (fieldKey === "latitude" ? value : payload.lat));
    const lng = Number(payload.longitude ?? (fieldKey === "longitude" ? value : payload.lng));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;
    await sql`
      UPDATE merchant_stores SET
        latitude = ${lat},
        longitude = ${lng},
        updated_at = now()
      WHERE id = ${storeId}
    `;
    return;
  }
  if (fieldKey === "cuisine_types") {
    const arr = Array.isArray(payload.cuisine_types)
      ? (payload.cuisine_types as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
      : value
        ? value.split(/[,|]/).map((s) => s.trim()).filter(Boolean)
        : [];
    await sql`UPDATE merchant_stores SET cuisine_types = ${arr}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "delivery_radius_km") {
    const n = Number(payload.delivery_radius_km ?? value);
    if (!Number.isFinite(n)) return;
    await sql`UPDATE merchant_stores SET delivery_radius_km = ${n}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "avg_preparation_time_minutes") {
    const n = Number(payload.avg_preparation_time_minutes ?? value);
    if (!Number.isFinite(n)) return;
    await sql`UPDATE merchant_stores SET avg_preparation_time_minutes = ${Math.floor(n)}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "min_order_amount") {
    const n = Number(payload.min_order_amount ?? value);
    if (!Number.isFinite(n)) return;
    await sql`UPDATE merchant_stores SET min_order_amount = ${n}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "is_pure_veg") {
    const normalizedValue = value?.toLowerCase() ?? "";
    const boolVal =
      payload.is_pure_veg === true ||
      payload.is_pure_veg === false
        ? Boolean(payload.is_pure_veg)
        : value === "true" || value === "1" || normalizedValue === "yes";
    await sql`UPDATE merchant_stores SET is_pure_veg = ${boolVal}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "accepts_online_payment") {
    const normalizedValue = value?.toLowerCase() ?? "";
    const boolVal =
      payload.accepts_online_payment === true || payload.accepts_online_payment === false
        ? Boolean(payload.accepts_online_payment)
        : value === "true" || value === "1" || normalizedValue === "yes";
    await sql`UPDATE merchant_stores SET accepts_online_payment = ${boolVal}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
  if (fieldKey === "accepts_cash") {
    const normalizedValue = value?.toLowerCase() ?? "";
    const boolVal =
      payload.accepts_cash === true || payload.accepts_cash === false
        ? Boolean(payload.accepts_cash)
        : value === "true" || value === "1" || normalizedValue === "yes";
    await sql`UPDATE merchant_stores SET accepts_cash = ${boolVal}, updated_at = now() WHERE id = ${storeId}`;
    return;
  }
}

/**
 * Promote pending rows for a document type (step 4) before marking verified.
 */
export async function applyPendingDocumentResubmissions(params: {
  storeId: number;
  docType: string;
  appliedBySystemUserId?: number | null;
}): Promise<number> {
  const pending = await listPendingOnboardingResubmissions(params.storeId, {
    fieldKey: params.docType,
  });
  const docs = pending.filter(
    (p) => DOC_FIELD_KEYS.has(p.field_key) || p.verification_step === 4 || p.verification_step === 6
  );
  for (const row of docs) {
    await applyDocumentResubmission(
      params.storeId,
      row.field_key,
      row.payload,
      row.proxy_url
    );
  }
  await markApplied(
    docs.map((d) => d.id),
    params.appliedBySystemUserId ?? null
  );
  return docs.length;
}

/**
 * Promote all pending rows for a verification step (1–8) into live tables + clear replaced R2.
 */
export async function applyPendingStepResubmissions(params: {
  storeId: number;
  verificationStep: number;
  appliedBySystemUserId?: number | null;
}): Promise<number> {
  const pending = await listPendingOnboardingResubmissions(params.storeId, {
    verificationStep: params.verificationStep,
  });
  for (const row of pending) {
    if (DOC_FIELD_KEYS.has(row.field_key)) {
      await applyDocumentResubmission(
        params.storeId,
        row.field_key,
        row.payload,
        row.proxy_url
      );
    } else {
      await applyStoreFieldResubmission(
        params.storeId,
        row.field_key,
        row.payload,
        row.proxy_url
      );
    }
  }
  await markApplied(
    pending.map((p) => p.id),
    params.appliedBySystemUserId ?? null
  );
  return pending.length;
}

/**
 * Promote pending rows for specific field keys only (e.g. banner_url / gallery_images)
 * without applying the rest of the verification step.
 */
export async function applyPendingFieldResubmissions(params: {
  storeId: number;
  fieldKeys: string[];
  appliedBySystemUserId?: number | null;
}): Promise<number> {
  const keys = [...new Set(params.fieldKeys.map((k) => k.trim()).filter(Boolean))];
  if (keys.length === 0) return 0;
  const pending = (await listPendingOnboardingResubmissions(params.storeId)).filter((p) =>
    keys.includes(p.field_key)
  );
  for (const row of pending) {
    if (DOC_FIELD_KEYS.has(row.field_key)) {
      await applyDocumentResubmission(
        params.storeId,
        row.field_key,
        row.payload,
        row.proxy_url
      );
    } else {
      await applyStoreFieldResubmission(
        params.storeId,
        row.field_key,
        row.payload,
        row.proxy_url
      );
    }
  }
  await markApplied(
    pending.map((p) => p.id),
    params.appliedBySystemUserId ?? null
  );
  return pending.length;
}

export type ResubmissionItemInput = {
  verificationStep: number;
  fieldKey: string;
  payload: Record<string, unknown>;
  r2ObjectKey?: string | null;
  proxyUrl?: string | null;
};

/** Stage AM/partner resubmit payloads (one pending per store/step/field; multi-resubmit allowed). */
export async function upsertPendingOnboardingResubmissions(params: {
  storeDbId: number;
  parentId?: number | null;
  authUserId?: string | null;
  items: ResubmissionItemInput[];
}): Promise<{ saved: number }> {
  const { storeDbId, parentId = null, authUserId = null, items } = params;
  if (!Number.isFinite(storeDbId) || storeDbId <= 0 || items.length === 0) {
    return { saved: 0 };
  }
  const sql = getSql();
  let saved = 0;
  for (const item of items) {
    const step = Math.floor(Number(item.verificationStep));
    const fieldKey = String(item.fieldKey || "").trim();
    if (!Number.isFinite(step) || step < 1 || step > 8 || !fieldKey) continue;
    try {
      // Read previous pending for cycle_number continuity (do not delete its R2 —
      // Rejected UI needs last resubmitted files after admin re-reject).
      const prevPending = await sql`
        SELECT r2_object_key, proxy_url, payload, cycle_number
        FROM merchant_store_onboarding_resubmissions
        WHERE store_id = ${storeDbId}
          AND verification_step = ${step}
          AND field_key = ${fieldKey}
          AND status = 'pending'
        ORDER BY submitted_at DESC
        LIMIT 1
      `;
      const prevRow = (Array.isArray(prevPending) ? prevPending[0] : prevPending) as
        | {
            r2_object_key?: unknown;
            proxy_url?: unknown;
            payload?: unknown;
            cycle_number?: unknown;
          }
        | undefined;

      let cycleNumber = 1;
      try {
        const cycleRows = await sql`
          SELECT COALESCE(MAX(cycle_number), 0)::int AS max_cycle
          FROM merchant_store_onboarding_resubmissions
          WHERE store_id = ${storeDbId}
            AND verification_step = ${step}
            AND field_key = ${fieldKey}
        `;
        const cycleRow = (Array.isArray(cycleRows) ? cycleRows[0] : cycleRows) as
          | { max_cycle?: number }
          | undefined;
        const maxCycle = Number(cycleRow?.max_cycle ?? 0);
        // Same reject round keeps cycle when replacing pending; bump only when no pending left
        // (i.e. previous was applied/discarded by reject). If pending exists, keep its cycle.
        if (prevRow?.cycle_number != null && Number(prevRow.cycle_number) > 0) {
          cycleNumber = Number(prevRow.cycle_number);
        } else {
          cycleNumber = Math.max(1, maxCycle + 1);
        }
      } catch {
        cycleNumber = 1;
      }

      await sql`
        UPDATE merchant_store_onboarding_resubmissions
        SET status = 'discarded',
            discarded_at = now(),
            updated_at = now()
        WHERE store_id = ${storeDbId}
          AND verification_step = ${step}
          AND field_key = ${fieldKey}
          AND status = 'pending'
      `;
      const payloadJson = JSON.stringify(item.payload || {});
      try {
        await sql`
          INSERT INTO merchant_store_onboarding_resubmissions (
            store_id, parent_id, verification_step, field_key, payload,
            r2_object_key, proxy_url, status, cycle_number,
            submitted_at, submitted_by_auth_user_id, updated_at
          ) VALUES (
            ${storeDbId},
            ${parentId},
            ${step},
            ${fieldKey},
            ${payloadJson}::jsonb,
            ${item.r2ObjectKey ?? null},
            ${item.proxyUrl ?? null},
            'pending',
            ${cycleNumber},
            now(),
            ${authUserId},
            now()
          )
        `;
      } catch (insertWithCycleErr) {
        // Fallback when cycle_number column not yet migrated
        console.warn(
          "[upsertPendingOnboardingResubmissions] cycle_number insert failed, retrying without:",
          insertWithCycleErr
        );
        await sql`
          INSERT INTO merchant_store_onboarding_resubmissions (
            store_id, parent_id, verification_step, field_key, payload,
            r2_object_key, proxy_url, status, submitted_at, submitted_by_auth_user_id, updated_at
          ) VALUES (
            ${storeDbId},
            ${parentId},
            ${step},
            ${fieldKey},
            ${payloadJson}::jsonb,
            ${item.r2ObjectKey ?? null},
            ${item.proxyUrl ?? null},
            'pending',
            now(),
            ${authUserId},
            now()
          )
        `;
      }
      saved += 1;
    } catch (e) {
      console.warn("[upsertPendingOnboardingResubmissions]", fieldKey, e);
    }
  }
  return { saved };
}

/** Mark step4_resubmission_flags without requiring a live URL overwrite. */
export async function markDocumentResubmissionFlags(
  storeDbId: number,
  docKeys: string[]
): Promise<void> {
  if (!storeDbId || docKeys.length === 0) return;
  const sql = getSql() as {
    unsafe: (q: string, p?: unknown[]) => Promise<unknown[]>;
  };
  await sql.unsafe(
    `INSERT INTO merchant_store_documents (store_id) VALUES ($1) ON CONFLICT (store_id) DO NOTHING`,
    [storeDbId]
  );
  for (const key of docKeys) {
    const k = String(key || "").trim();
    if (!k) continue;
    try {
      await sql.unsafe(
        `UPDATE merchant_store_documents SET
          step4_resubmission_flags = jsonb_set(
            COALESCE(step4_resubmission_flags, '{}'::jsonb),
            ARRAY[$2]::text[],
            'true'::jsonb,
            true
          ),
          updated_at = now()
        WHERE store_id = $1`,
        [storeDbId, k]
      );
    } catch (e) {
      console.warn("[markDocumentResubmissionFlags]", k, e);
    }
  }
}
