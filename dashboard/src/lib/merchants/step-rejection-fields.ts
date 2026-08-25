/**
 * Field keys an admin can mark when rejecting a verification step.
 * Stored in store_verification_step_rejections.step_rejection_detail (v1 or v2).
 * Keep in sync with partnersite/src/lib/onboarding/step-rejection-fields.ts
 */

export type RejectedFieldType =
  | "text"
  | "textarea"
  | "select"
  | "phones"
  | "number"
  | "boolean"
  | "latlng"
  | "image"
  | "gallery"
  | "document"
  | "date";

export type RejectedFieldValidationRules = {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: string;
  digits?: number;
};

export type RejectedFieldUploadConfig = {
  accept?: string;
  maxBytes?: number;
  numberField?: string;
  expiryField?: string;
};

export type RejectableFieldDef = {
  key: string;
  label: string;
  fieldType: RejectedFieldType;
  validationRules?: RejectedFieldValidationRules;
  uploadConfig?: RejectedFieldUploadConfig;
  selectOptions?: Array<{ value: string; label: string }>;
};

export type StepRejectionFieldMeta = {
  fieldKey: string;
  fieldType: RejectedFieldType;
  label: string;
  previousValue?: unknown;
  rejectionReason?: string;
  currentStatus?: "rejected" | "pending_review";
  validationRules?: RejectedFieldValidationRules;
  uploadConfig?: RejectedFieldUploadConfig;
  selectOptions?: Array<{ value: string; label: string }>;
};

/** @deprecated Prefer StepRejectionDetailV2 via normalizeStepRejectionDetail */
export type StepRejectionDetailV1 = {
  version?: 1;
  rejected_fields: string[];
  note?: string;
  last_resubmitted?: Record<string, string>;
};

export type StepRejectionDetailV2 = {
  version: 2;
  fields: StepRejectionFieldMeta[];
  /** Compat mirror of fields[].fieldKey */
  rejected_fields: string[];
  note?: string;
  last_resubmitted?: Record<string, string>;
};

const IMAGE_UPLOAD: RejectedFieldUploadConfig = {
  accept: "image/png,image/jpeg,.png,.jpg,.jpeg",
  maxBytes: 20 * 1024 * 1024,
};

const DOC_UPLOAD: RejectedFieldUploadConfig = {
  accept: "image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf",
  maxBytes: 20 * 1024 * 1024,
};

import { FALLBACK_ONBOARDING_STORE_TYPES } from "@/lib/onboarding-store-types";

const STORE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  ...FALLBACK_ONBOARDING_STORE_TYPES,
  { value: "OTHERS", label: "Others" },
];

const BOOL_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];

export const STEP1_REJECTABLE_FIELDS: RejectableFieldDef[] = [
  { key: "store_name", label: "Store name", fieldType: "text", validationRules: { required: true, minLength: 2 } },
  { key: "store_display_name", label: "Display name", fieldType: "text", validationRules: { required: true } },
  { key: "owner_full_name", label: "Owner full name", fieldType: "text", validationRules: { required: true } },
  {
    key: "store_type",
    label: "Store type",
    fieldType: "select",
    validationRules: { required: true },
    selectOptions: STORE_TYPE_OPTIONS,
  },
  { key: "store_email", label: "Email", fieldType: "text", validationRules: { required: true } },
  { key: "store_phones", label: "Phones", fieldType: "phones", validationRules: { required: true } },
  { key: "store_description", label: "Description", fieldType: "textarea" },
  {
    key: "banner_url",
    label: "Banner image",
    fieldType: "image",
    validationRules: { required: true },
    uploadConfig: IMAGE_UPLOAD,
  },
  {
    key: "gallery_images",
    label: "Gallery images",
    fieldType: "gallery",
    uploadConfig: IMAGE_UPLOAD,
  },
];

export const STEP2_REJECTABLE_FIELDS: RejectableFieldDef[] = [
  { key: "full_address", label: "Full address", fieldType: "textarea", validationRules: { required: true } },
  { key: "landmark", label: "Landmark", fieldType: "text" },
  { key: "city", label: "City", fieldType: "text", validationRules: { required: true } },
  { key: "state", label: "State", fieldType: "text", validationRules: { required: true } },
  { key: "postal_code", label: "Postal code", fieldType: "text", validationRules: { required: true } },
  {
    key: "map_location",
    label: "Map location (lat/lng)",
    fieldType: "latlng",
    validationRules: { required: true },
  },
];

export const STEP5_REJECTABLE_FIELDS: RejectableFieldDef[] = [
  { key: "cuisine_types", label: "Cuisine types", fieldType: "text", validationRules: { required: true } },
  {
    key: "delivery_radius_km",
    label: "Delivery radius",
    fieldType: "number",
    validationRules: { required: true, min: 0 },
  },
  {
    key: "avg_preparation_time_minutes",
    label: "Prep time",
    fieldType: "number",
    validationRules: { required: true, min: 1 },
  },
  {
    key: "min_order_amount",
    label: "Min order amount",
    fieldType: "number",
    validationRules: { required: true, min: 0 },
  },
  {
    key: "is_pure_veg",
    label: "Pure veg toggle",
    fieldType: "boolean",
    selectOptions: BOOL_OPTIONS,
  },
  {
    key: "accepts_online_payment",
    label: "Online payment",
    fieldType: "boolean",
    selectOptions: BOOL_OPTIONS,
  },
  {
    key: "accepts_cash",
    label: "Cash payment",
    fieldType: "boolean",
    selectOptions: BOOL_OPTIONS,
  },
];

/** Document keys used on steps 4/6 (metadata emission for AM/Partner). */
export const DOC_REJECTABLE_FIELDS: RejectableFieldDef[] = [
  {
    key: "pan",
    label: "PAN",
    fieldType: "document",
    validationRules: { required: true },
    uploadConfig: { ...DOC_UPLOAD, numberField: "pan_number" },
  },
  {
    key: "aadhaar",
    label: "Aadhaar",
    fieldType: "document",
    validationRules: { required: true },
    uploadConfig: { ...DOC_UPLOAD, numberField: "aadhar_number" },
  },
  {
    key: "fssai",
    label: "FSSAI",
    fieldType: "document",
    validationRules: { required: true, digits: 14 },
    uploadConfig: {
      ...DOC_UPLOAD,
      numberField: "fssai_number",
      expiryField: "fssai_expiry_date",
    },
  },
  {
    key: "gst",
    label: "GST",
    fieldType: "document",
    validationRules: { required: true },
    uploadConfig: { ...DOC_UPLOAD, numberField: "gst_number" },
  },
  {
    key: "bank_proof",
    label: "Bank proof",
    fieldType: "document",
    validationRules: { required: true },
    uploadConfig: DOC_UPLOAD,
  },
];

export function rejectableFieldsForStep(step: number): RejectableFieldDef[] {
  if (step === 1) return STEP1_REJECTABLE_FIELDS;
  if (step === 2) return STEP2_REJECTABLE_FIELDS;
  if (step === 5) return STEP5_REJECTABLE_FIELDS;
  if (step === 4) return DOC_REJECTABLE_FIELDS.filter((f) => f.key !== "bank_proof");
  if (step === 6) return DOC_REJECTABLE_FIELDS.filter((f) => f.key === "bank_proof");
  return [];
}

export function getRejectableFieldDef(step: number, key: string): RejectableFieldDef | undefined {
  const fromStep = rejectableFieldsForStep(step).find((f) => f.key === key);
  if (fromStep) return fromStep;
  return DOC_REJECTABLE_FIELDS.find((f) => f.key === key);
}

export function parseStepRejectionDetail(raw: unknown): StepRejectionDetailV1 | null {
  const v2 = normalizeStepRejectionDetail(raw, 0);
  if (!v2 || v2.fields.length === 0) return null;
  return {
    version: 1,
    rejected_fields: v2.rejected_fields,
    ...(v2.note ? { note: v2.note } : {}),
    ...(v2.last_resubmitted ? { last_resubmitted: v2.last_resubmitted } : {}),
  };
}

export function buildStepRejectionDetail(
  rejectedFields: string[],
  note?: string
): StepRejectionDetailV1 | null {
  const fields = rejectedFields.map((f) => f.trim()).filter(Boolean);
  if (fields.length === 0) return null;
  return {
    version: 1,
    rejected_fields: fields,
    ...(note?.trim() ? { note: note.trim() } : {}),
  };
}

export function buildStepRejectionDetailV2(params: {
  step: number;
  fields: Array<{
    fieldKey: string;
    rejectionReason: string;
    previousValue?: unknown;
  }>;
  note?: string;
  last_resubmitted?: Record<string, string>;
}): StepRejectionDetailV2 | null {
  const built: StepRejectionFieldMeta[] = [];
  for (const f of params.fields) {
    const key = String(f.fieldKey || "").trim();
    const reason = String(f.rejectionReason || "").trim();
    if (!key || !reason) continue;
    const def = getRejectableFieldDef(params.step, key);
    built.push({
      fieldKey: key,
      fieldType: def?.fieldType ?? "text",
      label: def?.label ?? key,
      previousValue: f.previousValue ?? null,
      rejectionReason: reason,
      currentStatus: "rejected",
      ...(def?.validationRules ? { validationRules: def.validationRules } : {}),
      ...(def?.uploadConfig ? { uploadConfig: def.uploadConfig } : {}),
      ...(def?.selectOptions ? { selectOptions: def.selectOptions } : {}),
    });
  }
  if (built.length === 0) return null;
  return {
    version: 2,
    fields: built,
    rejected_fields: built.map((f) => f.fieldKey),
    ...(params.note?.trim() ? { note: params.note.trim() } : {}),
    ...(params.last_resubmitted ? { last_resubmitted: params.last_resubmitted } : {}),
  };
}

/**
 * Always returns v2 shape. Upgrades v1 `rejected_fields` using the registry + fallback reason.
 */
export function normalizeStepRejectionDetail(
  raw: unknown,
  step: number,
  fallbackReason?: string
): StepRejectionDetailV2 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const note = typeof o.note === "string" && o.note.trim() ? o.note.trim() : undefined;
  const last =
    o.last_resubmitted && typeof o.last_resubmitted === "object" && !Array.isArray(o.last_resubmitted)
      ? (o.last_resubmitted as Record<string, string>)
      : undefined;

  const reasonFallback = (fallbackReason || note || "").trim();

  if (Array.isArray(o.fields) && o.fields.length > 0) {
    const fields: StepRejectionFieldMeta[] = [];
    for (const item of o.fields) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const fieldKey = String(row.fieldKey || row.key || "").trim();
      if (!fieldKey) continue;
      const def = getRejectableFieldDef(step, fieldKey);
      const fieldType = (String(row.fieldType || def?.fieldType || "text") as RejectedFieldType) || "text";
      const label = String(row.label || def?.label || fieldKey);
      const rejectionReason = String(row.rejectionReason || reasonFallback || "").trim();
      fields.push({
        fieldKey,
        fieldType,
        label,
        previousValue: row.previousValue ?? null,
        rejectionReason: rejectionReason || undefined,
        currentStatus:
          row.currentStatus === "pending_review" || row.currentStatus === "rejected"
            ? row.currentStatus
            : "rejected",
        validationRules:
          (row.validationRules as RejectedFieldValidationRules | undefined) || def?.validationRules,
        uploadConfig: (row.uploadConfig as RejectedFieldUploadConfig | undefined) || def?.uploadConfig,
        selectOptions:
          (row.selectOptions as Array<{ value: string; label: string }> | undefined) ||
          def?.selectOptions,
      });
    }
    if (fields.length === 0) return null;
    return {
      version: 2,
      fields,
      rejected_fields: fields.map((f) => f.fieldKey),
      ...(note ? { note } : {}),
      ...(last ? { last_resubmitted: last } : {}),
    };
  }

  const keys = Array.isArray(o.rejected_fields)
    ? o.rejected_fields.filter((x): x is string => typeof x === "string" && !!x.trim())
    : [];
  if (keys.length === 0) return null;

  const fields: StepRejectionFieldMeta[] = keys.map((fieldKey) => {
    const def = getRejectableFieldDef(step, fieldKey);
    return {
      fieldKey,
      fieldType: def?.fieldType ?? "text",
      label: def?.label ?? fieldKey,
      previousValue: last?.[fieldKey] ?? null,
      rejectionReason: reasonFallback || undefined,
      currentStatus: "rejected" as const,
      ...(def?.validationRules ? { validationRules: def.validationRules } : {}),
      ...(def?.uploadConfig ? { uploadConfig: def.uploadConfig } : {}),
      ...(def?.selectOptions ? { selectOptions: def.selectOptions } : {}),
    };
  });

  return {
    version: 2,
    fields,
    rejected_fields: fields.map((f) => f.fieldKey),
    ...(note ? { note } : {}),
    ...(last ? { last_resubmitted: last } : {}),
  };
}

export function labelForRejectedField(step: number, key: string): string {
  const def = getRejectableFieldDef(step, key);
  return def?.label ?? key;
}

export function labelsForRejectedFields(step: number, keys: string[]): string[] {
  return keys.map((k) => labelForRejectedField(step, k));
}

/** Build document meta entries from live document rejection columns.
 * Only includes documents that were actually rejected (per-doc reason / detail),
 * optionally intersected with `allowKeys` from step_rejection_detail.
 * Never treats the step-level rejectionReason as "all docs rejected".
 */
export function buildDocRejectedFieldsMeta(params: {
  step: number;
  documents: Record<string, unknown> | null | undefined;
  stepReason?: string;
  pendingKeys?: Set<string>;
  /** When non-empty, only these document keys may appear. */
  allowKeys?: Set<string> | string[] | null;
}): StepRejectionFieldMeta[] {
  const docs = params.documents || {};
  const out: StepRejectionFieldMeta[] = [];
  const defs =
    params.step === 6
      ? DOC_REJECTABLE_FIELDS.filter((f) => f.key === "bank_proof")
      : DOC_REJECTABLE_FIELDS.filter((f) => f.key !== "bank_proof");
  const allow =
    params.allowKeys != null
      ? new Set(Array.from(params.allowKeys as Iterable<string>).map(String).filter(Boolean))
      : null;

  const reasonKey: Record<string, string> = {
    pan: "pan_rejection_reason",
    aadhaar: "aadhaar_rejection_reason",
    fssai: "fssai_rejection_reason",
    gst: "gst_rejection_reason",
    bank_proof: "bank_proof_rejection_reason",
  };
  const numberKey: Record<string, string[]> = {
    pan: ["pan_number", "pan_document_number"],
    aadhaar: ["aadhar_number", "aadhaar_document_number"],
    fssai: ["fssai_number", "fssai_document_number"],
    gst: ["gst_number", "gst_document_number"],
  };
  const urlKey: Record<string, string[]> = {
    pan: ["pan_image_url", "pan_document_url"],
    aadhaar: ["aadhar_front_url", "aadhaar_document_url"],
    fssai: ["fssai_image_url", "fssai_document_url"],
    gst: ["gst_image_url", "gst_document_url"],
    bank_proof: ["bank_proof_file_url", "bank_proof_document_url"],
  };

  for (const def of defs) {
    if (allow && allow.size > 0 && !allow.has(def.key)) continue;

    const rk = reasonKey[def.key];
    const perDocReason =
      rk && typeof docs[rk] === "string" ? String(docs[rk]).trim() : "";
    const detailRoot =
      docs.step4_rejection_details && typeof docs.step4_rejection_details === "object"
        ? (docs.step4_rejection_details as Record<string, unknown>)
        : null;
    const hasDetail = Boolean(detailRoot && detailRoot[def.key]);
    const explicitlyAllowlisted = Boolean(allow && allow.size > 0 && allow.has(def.key));

    // Inclusion is driven by per-doc evidence or explicit step detail keys — never stepReason alone.
    if (!perDocReason && !hasDetail && !explicitlyAllowlisted) continue;

    const reason =
      perDocReason ||
      (explicitlyAllowlisted || hasDetail ? String(params.stepReason || "").trim() : "") ||
      `${def.label} was rejected.`;

    const prev: Record<string, unknown> = {};
    for (const k of numberKey[def.key] || []) {
      const v = docs[k];
      if (v != null && String(v).trim()) {
        prev.document_number = v;
        break;
      }
    }
    for (const k of urlKey[def.key] || []) {
      const v = docs[k];
      if (v != null && String(v).trim()) {
        prev.document_url = v;
        break;
      }
    }
    if (def.key === "fssai" && docs.fssai_expiry_date != null && String(docs.fssai_expiry_date).trim()) {
      prev.expiry_date = docs.fssai_expiry_date;
    }

    out.push({
      fieldKey: def.key,
      fieldType: "document",
      label: def.label,
      previousValue: prev,
      rejectionReason: reason,
      currentStatus: params.pendingKeys?.has(def.key) ? "pending_review" : "rejected",
      validationRules: def.validationRules,
      uploadConfig: def.uploadConfig,
    });
  }
  return out;
}
