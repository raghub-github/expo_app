import {
  buildDocRejectedFieldsMeta,
  normalizeStepRejectionDetail,
  type StepRejectionFieldMeta,
} from "@/lib/onboarding/step-rejection-fields";

function isBlankPrevious(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return !value.trim();
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return Object.values(o).every((v) => v == null || v === "" || (Array.isArray(v) && v.length === 0));
  }
  return false;
}

function pickDocPreviousFromDocuments(
  fieldKey: string,
  documents: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!documents) return null;
  const numberKey: Record<string, string[]> = {
    pan: ["pan_number", "pan_document_number"],
    aadhaar: ["aadhar_number", "aadhaar_document_number"],
    fssai: ["fssai_number", "fssai_document_number"],
    gst: ["gst_number", "gst_document_number"],
    bank_proof: ["bank_proof_document_number"],
  };
  const urlKey: Record<string, string[]> = {
    pan: ["pan_image_url", "pan_document_url"],
    aadhaar: ["aadhar_front_url", "aadhaar_document_url"],
    fssai: ["fssai_image_url", "fssai_document_url"],
    gst: ["gst_image_url", "gst_document_url"],
    bank_proof: ["bank_proof_file_url", "bank_proof_document_url"],
  };
  const prev: Record<string, unknown> = {};
  for (const k of numberKey[fieldKey] || []) {
    const v = documents[k];
    if (v != null && String(v).trim()) {
      prev.document_number = v;
      break;
    }
  }
  for (const k of urlKey[fieldKey] || []) {
    const v = documents[k];
    if (v != null && String(v).trim()) {
      prev.document_url = v;
      break;
    }
  }
  if (fieldKey === "fssai" && documents.fssai_expiry_date != null && String(documents.fssai_expiry_date).trim()) {
    prev.expiry_date = documents.fssai_expiry_date;
  }
  return Object.keys(prev).length > 0 ? prev : null;
}

function mergePreviousValues(a: unknown, b: unknown): unknown {
  if (isBlankPrevious(a)) return b ?? a;
  if (isBlankPrevious(b)) return a;
  if (a && typeof a === "object" && !Array.isArray(a) && b && typeof b === "object" && !Array.isArray(b)) {
    return { ...(a as Record<string, unknown>), ...(b as Record<string, unknown>) };
  }
  return a;
}

function enrichPreviousValue(
  field: StepRejectionFieldMeta,
  storeSnap: Record<string, unknown>,
  lastOld: Record<string, string>,
  documents?: Record<string, unknown> | null
): unknown {
  let prev = field.previousValue;

  if (field.fieldType === "document" || ["pan", "aadhaar", "fssai", "gst", "bank_proof"].includes(field.fieldKey)) {
    const fromDocs = pickDocPreviousFromDocuments(field.fieldKey, documents);
    prev = mergePreviousValues(prev, fromDocs);
    if (!isBlankPrevious(prev)) return prev;
  }

  if (!isBlankPrevious(prev)) return prev;

  if (field.fieldKey === "map_location") {
    return {
      latitude: lastOld.latitude ?? storeSnap.latitude ?? null,
      longitude: lastOld.longitude ?? storeSnap.longitude ?? null,
    };
  }
  if (field.fieldKey === "banner_url") {
    return lastOld.banner_url || storeSnap.banner_url || null;
  }
  if (field.fieldKey === "gallery_images") {
    return storeSnap.gallery_images ?? null;
  }
  if (lastOld[field.fieldKey]) return lastOld[field.fieldKey];
  if (field.fieldKey === "store_phones") {
    const phones = storeSnap.store_phones;
    if (Array.isArray(phones)) return phones.map(String).join(", ");
    return phones ?? null;
  }
  return storeSnap[field.fieldKey] ?? null;
}

/**
 * Build rejectedFieldsMeta for one rejection step (v1/v2 detail + docs for 4/6).
 * Only rejected field keys from step_rejection_detail / per-doc evidence are included —
 * never every document in an onboarding step.
 */
export function buildRejectedFieldsMetaForStep(params: {
  step: number;
  rejectionReason: string;
  stepRejectionDetail: unknown;
  storeSnap: Record<string, unknown>;
  documents: Record<string, unknown> | null;
  lastOldValues: Record<string, string>;
  pendingFieldKeys?: Set<string>;
}): StepRejectionFieldMeta[] {
  const pending = params.pendingFieldKeys ?? new Set<string>();
  const normalized = normalizeStepRejectionDetail(
    params.stepRejectionDetail,
    params.step,
    params.rejectionReason
  );
  const allowKeys = new Set(
    (normalized?.rejected_fields ?? []).map(String).map((k) => k.trim()).filter(Boolean)
  );

  let fields: StepRejectionFieldMeta[] = (normalized?.fields ?? []).map((f) => ({
    ...f,
    previousValue: enrichPreviousValue(f, params.storeSnap, params.lastOldValues, params.documents),
    currentStatus: pending.has(f.fieldKey) ? "pending_review" : f.currentStatus || "rejected",
    rejectionReason: f.rejectionReason || params.rejectionReason || undefined,
  }));

  if (allowKeys.size > 0) {
    fields = fields.filter((f) => allowKeys.has(f.fieldKey));
  }

  if (params.step === 4 || params.step === 6) {
    const docsMeta = buildDocRejectedFieldsMeta({
      step: params.step,
      documents: params.documents,
      stepReason: params.rejectionReason,
      pendingKeys: pending,
      allowKeys: allowKeys.size > 0 ? allowKeys : null,
    });
    const byKey = new Map(fields.map((f) => [f.fieldKey, f]));
    for (const d of docsMeta) {
      if (allowKeys.size > 0 && !allowKeys.has(d.fieldKey)) continue;
      const existing = byKey.get(d.fieldKey);
      if (!existing) {
        byKey.set(d.fieldKey, d);
        fields.push(d);
        continue;
      }
      // Upgrade empty / partial previousValue with live document snapshot.
      existing.previousValue = mergePreviousValues(existing.previousValue, d.previousValue);
      if (!existing.rejectionReason && d.rejectionReason) {
        existing.rejectionReason = d.rejectionReason;
      }
      if (!existing.uploadConfig && d.uploadConfig) existing.uploadConfig = d.uploadConfig;
    }
    if (fields.length === 0 && params.rejectionReason) {
      fields = buildDocRejectedFieldsMeta({
        step: params.step,
        documents: params.documents,
        pendingKeys: pending,
        allowKeys: null,
      });
    }
  }

  return fields;
}
