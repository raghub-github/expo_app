/**
 * Helpers for persisting / restoring merchant store document auto-verification.
 * Stored on merchant_store_documents (*_is_verified, *_verification_method,
 * *_document_metadata.auto_verification, extracted_data_summary).
 */

export type DocAutoVerificationMethod =
  | "CASHFREE_AUTO"
  | "CASHFREE_ASSISTED"
  | "CASHFREE_MANUAL_FALLBACK"
  | "DIGILOCKER"
  | "MANUAL_UPLOAD"
  | "AGENT";

export type DocAutoVerificationPayload = {
  method: DocAutoVerificationMethod;
  status: "verified" | "manual_review";
  verified_at: string;
  verified_data: Record<string, unknown>;
  document_number?: string | null;
  verification_id?: string | null;
  provider_reference?: string | null;
  pending_review?: boolean;
};

export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Read nested auto_verification blob from a document metadata JSONB column. */
export function readAutoVerificationFromMetadata(
  metadata: unknown,
): DocAutoVerificationPayload | null {
  const auto = asRecord(asRecord(metadata).auto_verification);
  if (!auto || Object.keys(auto).length === 0) return null;
  const status = String(auto.status ?? "").toLowerCase();
  if (status !== "verified" && status !== "manual_review") return null;
  return {
    method: (String(auto.method || "CASHFREE_AUTO") as DocAutoVerificationMethod),
    status: status as "verified" | "manual_review",
    verified_at: String(auto.verified_at ?? ""),
    verified_data: asRecord(auto.verified_data),
    document_number: auto.document_number != null ? String(auto.document_number) : null,
    verification_id: auto.verification_id != null ? String(auto.verification_id) : null,
    provider_reference: auto.provider_reference != null ? String(auto.provider_reference) : null,
    pending_review: Boolean(auto.pending_review),
  };
}

/** Merge auto_verification into an existing metadata object (preserves back_url etc.). */
export function mergeAutoVerificationMetadata(
  existingMetadata: unknown,
  payload: DocAutoVerificationPayload,
): Record<string, unknown> {
  const base = asRecord(existingMetadata);
  return {
    ...base,
    auto_verification: {
      method: payload.method,
      status: payload.status,
      verified_at: payload.verified_at,
      verified_data: payload.verified_data ?? {},
      document_number: payload.document_number ?? null,
      verification_id: payload.verification_id ?? null,
      provider_reference: payload.provider_reference ?? null,
      pending_review: Boolean(payload.pending_review),
    },
  };
}

/** Nest verification summary under document kind so PAN/GST/Aadhaar don't overwrite each other. */
export function mergeExtractedDataSummary(
  existing: unknown,
  kind: "pan" | "gstin" | "aadhaar" | string,
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const base = asRecord(existing);
  return {
    ...base,
    [kind]: {
      ...asRecord(base[kind]),
      ...entry,
      updated_at: new Date().toISOString(),
    },
  };
}

export function verifiedDetailsForUi(
  isVerified: boolean,
  metadata: unknown,
  fallbackHolderName?: string | null,
  extractedKind?: unknown,
): Record<string, unknown> | null {
  if (!isVerified) return null;
  const fromMeta = readAutoVerificationFromMetadata(metadata);
  if (fromMeta?.verified_data && Object.keys(fromMeta.verified_data).length > 0) {
    return fromMeta.verified_data;
  }
  const fromExtracted = asRecord(extractedKind);
  const nested = asRecord(fromExtracted.verifiedData ?? fromExtracted.verified_data);
  if (Object.keys(nested).length > 0) return nested;
  if (fallbackHolderName) {
    return { registered_name: fallbackHolderName, pan_status: "VALID" };
  }
  return {};
}

/** First-class GST business fields persisted on merchant_store_documents. */
export type GstFetchedBusinessInfo = {
  legal_business_name: string | null;
  principal_place_of_business: string | null;
  effective_registration_date: string | null;
};

/** Prefer YYYY-MM-DD; accept DD/MM/YYYY or DD-MM-YYYY from Cashfree. */
export function normalizeGstRegistrationDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return s;
}

/**
 * Pull Legal Name / Principal Place / Effective Registration Date from Cashfree
 * GSTIN verified_data (or already-normalized column-shaped keys).
 */
export function pickGstFetchedBusinessInfo(verifiedData: unknown): GstFetchedBusinessInfo {
  const d = asRecord(verifiedData);
  const legal =
    String(
      d.legal_name_of_business ??
        d.legal_business_name ??
        d.gst_legal_business_name ??
        "",
    ).trim() || null;
  let place =
    String(
      d.principal_place_address ??
        d.principal_place_of_business ??
        d.gst_principal_place_of_business ??
        "",
    ).trim() || null;
  if (!place) {
    const split = asRecord(d.principal_place_split_address);
    const parts = [
      split.address_line1 ?? split.building_name,
      split.street ?? split.locality,
      split.city ?? split.district,
      split.state,
      split.pincode ?? split.pin,
    ]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);
    if (parts.length) place = parts.join(", ");
  }
  const effective = normalizeGstRegistrationDate(
    String(
      d.date_of_registration ??
        d.effective_date_of_registration ??
        d.gst_effective_registration_date ??
        "",
    ).trim() || null,
  );
  return {
    legal_business_name: legal,
    principal_place_of_business: place,
    effective_registration_date: effective,
  };
}

/** Merge column values into verified_data so UI rows stay consistent after hydrate. */
export function mergeGstFetchedIntoVerifiedDetails(
  details: Record<string, unknown> | null | undefined,
  columns?: Partial<GstFetchedBusinessInfo> | null,
): Record<string, unknown> {
  const base = { ...(details && typeof details === "object" ? details : {}) };
  const picked = pickGstFetchedBusinessInfo({ ...base, ...(columns || {}) });
  if (picked.legal_business_name) {
    base.legal_name_of_business = picked.legal_business_name;
  }
  if (picked.principal_place_of_business) {
    base.principal_place_address = picked.principal_place_of_business;
  }
  if (picked.effective_registration_date) {
    base.date_of_registration = picked.effective_registration_date;
  }
  return base;
}

/** Fields fetched from Cashfree bank-account verify (BAV). */
export type BankFetchedInfo = {
  name_at_bank: string | null;
  bank_name: string | null;
  branch_name: string | null;
  account_type: string | null;
  account_status: string | null;
};

function normalizeBankAccountType(raw: unknown): string | null {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!s) return null;
  if (s === "savings" || s === "saving" || s === "sb" || s === "sav") return "SAVINGS";
  if (s === "current" || s === "ca" || s === "cc" || s === "od") return "CURRENT";
  if (s.includes("saving")) return "SAVINGS";
  if (s.includes("current")) return "CURRENT";
  return null;
}

export function pickBankFetchedInfo(verifiedData: unknown): BankFetchedInfo {
  const d = asRecord(verifiedData);
  const ifsc = asRecord(d.ifsc_details);
  return {
    name_at_bank: String(d.name_at_bank ?? d.account_holder_name ?? "").trim() || null,
    bank_name:
      String(d.bank_name ?? ifsc.bank_name ?? ifsc.bank ?? "").trim() || null,
    branch_name:
      String(
        d.branch_name ??
          d.branch ??
          ifsc.branch ??
          ifsc.branch_name ??
          "",
      ).trim() || null,
    account_type: normalizeBankAccountType(
      d.account_type ??
        d.accountType ??
        d.bank_account_type ??
        ifsc.account_type ??
        ifsc.accountType ??
        asRecord(d.raw).account_type ??
        asRecord(d.raw_response).account_type,
    ),
    account_status: String(d.account_status ?? d.status ?? "").trim() || null,
  };
}

/** Flatten nested Cashfree IFSC/BAV fields onto verified_data for UI + DB. */
export function flattenBankVerifiedData(
  verifiedData: unknown,
): Record<string, unknown> {
  const base = { ...asRecord(verifiedData) };
  const picked = pickBankFetchedInfo(base);
  if (picked.name_at_bank) base.name_at_bank = picked.name_at_bank;
  if (picked.bank_name) base.bank_name = picked.bank_name;
  if (picked.branch_name) base.branch_name = picked.branch_name;
  if (picked.account_type) base.account_type = picked.account_type;
  if (picked.account_status) base.account_status = picked.account_status;
  return base;
}

/** Fields fetched from Cashfree UPI VPA verify. */
export type UpiFetchedInfo = {
  vpa: string | null;
  name_at_bank: string | null;
  account_status: string | null;
};

export function pickUpiFetchedInfo(verifiedData: unknown): UpiFetchedInfo {
  const d = asRecord(verifiedData);
  return {
    vpa: String(d.vpa ?? "").trim().toLowerCase() || null,
    name_at_bank:
      String(d.name_at_bank ?? d.customer_name ?? d.account_holder_name ?? "").trim() ||
      null,
    account_status: String(d.account_status ?? d.account_exists ?? d.status ?? "").trim() || null,
  };
}
