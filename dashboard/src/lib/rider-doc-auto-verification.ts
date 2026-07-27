/**
 * Admin display helpers for rider document auto-verification payloads.
 * Source: rider_documents.extracted_data_summary + extracted_* columns + metadata.
 */

import type { AdminDocAutoVerificationDisplay } from "@/lib/merchant-doc-auto-verification";

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

const DETAIL_LABELS: Record<string, string> = {
  pan: "PAN",
  pan_status: "PAN status",
  type: "Type",
  category: "Category",
  name_provided: "Name provided (rider)",
  registered_name: "Registered name",
  father_name: "Father's name",
  name_match_result: "Name match",
  name_match_score: "Name match score",
  name: "Name",
  holder_name: "Holder name",
  full_name: "Full name",
  dob: "Date of birth",
  date_of_birth: "Date of birth",
  gender: "Gender",
  care_of: "Care of",
  address: "Address",
  masked_aadhaar: "Masked Aadhaar",
  aadhaar_number: "Aadhaar",
  uid: "UID",
  status: "Status",
  dl_number: "DL number",
  father_or_husband_name: "Father / husband name",
  date_of_issue: "Date of issue",
  dl_validity: "DL validity",
  dl_validity_summary: "DL validity",
  non_transport_from: "Non-transport from",
  non_transport_to: "Non-transport valid till",
  badge_details: "Badge details",
  class_of_vehicle: "Class of vehicle",
  cov_details: "Class of vehicle",
  permanent_address: "Permanent address",
  temporary_address: "Temporary address",
  reg_no: "Registration number",
  owner: "Owner",
  owner_father_name: "Owner father name",
  rc_status: "RC status",
  rc_expiry_date: "RC expiry",
  vehicle_class: "Vehicle class",
  vehicle_manufacturer_name: "Manufacturer",
  model: "Model",
  vehicle_colour: "Colour",
  fuel_type: "Fuel type",
  body_type: "Body type",
  reg_date: "Registration date",
  vehicle_insurance_upto: "Insurance valid till",
  vehicle_insurance_company_name: "Insurance company",
  rc_financer: "Financer",
  present_address: "Present address",
  is_commercial: "Commercial",
  vehicle_category: "Vehicle category",
  panNumber: "PAN (entered)",
  aadhaarNumber: "Aadhaar (entered)",
  dlNumber: "DL (entered)",
  rcNumber: "RC (entered)",
  digilockerVerified: "DigiLocker verified",
  name_at_bank: "Name at bank",
  bank_name: "Bank name",
  branch_name: "Branch",
  account_status: "Account status",
  account_status_code: "Status code",
  account_number_masked: "Account number",
  ifsc: "IFSC",
  utr: "UTR",
  bankAccountMasked: "Account number",
  bankHolderName: "Holder name",
};

const KIND_ORDER: Record<string, string[]> = {
  pan: [
    "pan",
    "registered_name",
    "name_provided",
    "father_name",
    "pan_status",
    "type",
    "name_match_result",
    "name_match_score",
    "panNumber",
  ],
  aadhaar: [
    "name",
    "holder_name",
    "full_name",
    "dob",
    "date_of_birth",
    "gender",
    "care_of",
    "masked_aadhaar",
    "aadhaar_number",
    "uid",
    "address",
    "status",
    "aadhaarNumber",
    "digilockerVerified",
  ],
  dl: [
    "dl_number",
    "name",
    "father_or_husband_name",
    "dob",
    "date_of_issue",
    "dl_validity_summary",
    "dl_validity",
    "non_transport_to",
    "class_of_vehicle",
    "cov_details",
    "permanent_address",
    "temporary_address",
    "address",
    "badge_details",
    "dlNumber",
  ],
  rc: [
    "reg_no",
    "owner",
    "owner_father_name",
    "rc_status",
    "vehicle_class",
    "vehicle_manufacturer_name",
    "model",
    "vehicle_colour",
    "fuel_type",
    "body_type",
    "reg_date",
    "rc_expiry_date",
    "vehicle_insurance_upto",
    "vehicle_insurance_company_name",
    "rc_financer",
    "permanent_address",
    "present_address",
    "is_commercial",
    "vehicle_category",
    "rcNumber",
  ],
  bank: [
    "name_at_bank",
    "bankHolderName",
    "account_number_masked",
    "bankAccountMasked",
    "ifsc",
    "bank_name",
    "branch_name",
    "account_status",
    "name_match_result",
    "name_match_score",
    "utr",
  ],
};

function docTypeToKind(docType: string): "pan" | "aadhaar" | "dl" | "rc" | "bank" | null {
  const t = String(docType || "").toLowerCase();
  if (t === "pan") return "pan";
  if (t === "aadhaar" || t.startsWith("aadhaar_")) return "aadhaar";
  if (t === "dl" || t.startsWith("dl_")) return "dl";
  if (t === "rc") return "rc";
  if (t === "bank_proof" || t === "bank_account") return "bank";
  return null;
}

function formatMethod(method: string | null | undefined, provider: string | null): string | null {
  const m = String(method ?? "").trim().toUpperCase();
  if (m === "APP_VERIFIED") {
    const p = String(provider ?? "").trim().toLowerCase();
    if (p === "cashfree") return "Cashfree (rider app)";
    if (p === "digilocker" || p.includes("digilocker")) return "DigiLocker";
    return "App auto-verified";
  }
  if (m === "CASHFREE_AUTO") return "Dashboard electronic";
  if (m === "CASHFREE_ASSISTED") return "Cashfree assisted";
  if (m === "CASHFREE_MANUAL_FALLBACK") return "Cashfree manual fallback";
  if (m === "RAZORPAY_BANK") return "Razorpay bank";
  if (!m) return provider ? String(provider) : null;
  return m.replace(/_/g, " ");
}

function formatDlValidity(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    if (t.startsWith("{")) {
      try {
        return formatDlValidity(JSON.parse(t));
      } catch {
        return t;
      }
    }
    return t;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const v = raw as Record<string, unknown>;
  const lines: string[] = [];

  const rangeLabel = (label: string, block: unknown) => {
    if (!block || typeof block !== "object" || Array.isArray(block)) return;
    const b = block as Record<string, unknown>;
    const from = b.from != null ? String(b.from).trim() : "";
    const to = b.to != null ? String(b.to).trim() : "";
    if (!from && !to) return;
    if (from && to) lines.push(`${label}: ${from} → ${to}`);
    else if (to) lines.push(`${label}: valid till ${to}`);
    else lines.push(`${label}: from ${from}`);
  };

  rangeLabel("Non-transport", v.non_transport);
  rangeLabel("Transport", v.transport);
  if (v.hill_valid_till != null && String(v.hill_valid_till).trim()) {
    lines.push(`Hill: valid till ${String(v.hill_valid_till).trim()}`);
  }
  if (v.hazardous_valid_till != null && String(v.hazardous_valid_till).trim()) {
    lines.push(`Hazardous: valid till ${String(v.hazardous_valid_till).trim()}`);
  }
  return lines.length ? lines.join(" · ") : null;
}

function stringifyValue(key: string, value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "dl_validity" || key === "dl_validity_summary") {
    return formatDlValidity(value);
  }
  if (typeof value === "string" || typeof value === "number") {
    const s = String(value).trim();
    return s || null;
  }
  if (Array.isArray(value)) {
    if (key === "cov_details" || key === "badge_details") {
      const cov = value
        .map((x) => {
          if (x == null) return "";
          if (typeof x === "string") return x.trim();
          const r = asRecord(x);
          return String(
            r.cov ?? r.class_of_vehicle ?? r.badge_no ?? r.badge_name ?? "",
          ).trim();
        })
        .filter(Boolean);
      return cov.length ? cov.join(", ") : null;
    }
    const parts = value
      .map((x) => {
        if (x == null) return "";
        if (typeof x === "object") {
          const r = asRecord(x);
          return String(
            r.complete_address ??
              r.cov ??
              r.class_of_vehicle ??
              r.badge_no ??
              r.name ??
              "",
          ).trim();
        }
        return String(x).trim();
      })
      .filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  if (key === "address" || key === "split_address" || key.includes("address")) {
    const a = asRecord(value);
    const parts = [
      a.house,
      a.street,
      a.landmark,
      a.locality,
      a.complete_address,
      a.address_line1,
      a.vtc ?? a.city ?? a.district,
      a.dist ?? a.district,
      a.state,
      a.pincode ?? a.pin,
    ]
      .map((x) => String(x ?? "").trim())
      .filter(Boolean);
    if (parts.length) return parts.join(", ");
  }
  return null;
}

function pushRows(
  details: Record<string, unknown>,
  kind: string,
): Array<{ label: string; value: string }> {
  const order = KIND_ORDER[kind] ?? Object.keys(DETAIL_LABELS);
  const rows: Array<{ label: string; value: string }> = [];
  const seen = new Set<string>();

  const push = (key: string) => {
    const label = DETAIL_LABELS[key];
    if (!label || seen.has(label)) return;
    const display = stringifyValue(key, details[key]);
    if (!display) return;
    rows.push({ label, value: display });
    seen.add(label);
  };

  for (const key of order) push(key);
  for (const key of Object.keys(details)) {
    if (!DETAIL_LABELS[key]) continue;
    push(key);
  }
  return rows;
}

export type RiderDocAutoVerificationSource = {
  docType: string;
  verificationMethod?: string | null;
  verified?: boolean | null;
  verifiedAt?: string | Date | null;
  extractedName?: string | null;
  extractedDob?: string | Date | null;
  docNumber?: string | null;
  extractedDataSummary?: unknown;
  lastVerificationId?: string | null;
  lastProviderReference?: string | null;
  metadata?: unknown;
};

/**
 * Build admin-facing auto-verification details for a rider document card.
 */
export function getRiderDocAutoVerificationDisplay(
  doc: RiderDocAutoVerificationSource | null | undefined,
): AdminDocAutoVerificationDisplay | null {
  if (!doc) return null;
  const kind = docTypeToKind(doc.docType);
  if (!kind) return null;

  const summary = asRecord(doc.extractedDataSummary);
  const verifiedData = {
    ...asRecord(summary.verifiedData ?? summary.verified_data),
  };
  const meta = asRecord(doc.metadata);

  // Rider-entered / onboarding capture fields
  for (const key of [
    "panNumber",
    "aadhaarNumber",
    "dlNumber",
    "rcNumber",
    "digilockerVerified",
  ] as const) {
    if (meta[key] != null && verifiedData[key] == null) {
      verifiedData[key] = meta[key];
    }
  }

  if (doc.docNumber?.trim() && kind === "pan" && !verifiedData.pan) {
    verifiedData.pan = doc.docNumber.trim().toUpperCase();
  }
  if (doc.docNumber?.trim() && kind === "dl" && !verifiedData.dl_number) {
    verifiedData.dl_number = doc.docNumber.trim();
  }
  if (doc.docNumber?.trim() && kind === "rc" && !verifiedData.reg_no) {
    verifiedData.reg_no = doc.docNumber.trim();
  }
  if (doc.docNumber?.trim() && kind === "aadhaar" && !verifiedData.masked_aadhaar) {
    verifiedData.masked_aadhaar = doc.docNumber.trim();
  }

  if (doc.extractedName?.trim()) {
    if (kind === "pan" && !String(verifiedData.registered_name ?? "").trim()) {
      verifiedData.registered_name = doc.extractedName.trim();
    } else if (!String(verifiedData.name ?? verifiedData.holder_name ?? "").trim()) {
      verifiedData.name = doc.extractedName.trim();
    }
  }
  if (doc.extractedDob) {
    const dob = String(doc.extractedDob).slice(0, 10);
    if (dob && !String(verifiedData.dob ?? verifiedData.date_of_birth ?? "").trim()) {
      verifiedData.dob = dob;
    }
  }

  const provider =
    typeof summary.provider === "string" ? summary.provider : null;
  const confidenceRaw = summary.confidence;
  const confidence =
    typeof confidenceRaw === "number" && Number.isFinite(confidenceRaw)
      ? confidenceRaw
      : typeof confidenceRaw === "string" &&
          confidenceRaw.trim() !== "" &&
          Number.isFinite(Number(confidenceRaw))
        ? Number(confidenceRaw)
        : null;

  const method = formatMethod(doc.verificationMethod, provider);
  const isAppVerified =
    String(doc.verificationMethod ?? "").toUpperCase() === "APP_VERIFIED";
  const isDashboardElectronic = (() => {
    const m = String(doc.verificationMethod ?? "").toUpperCase();
    return m.startsWith("CASHFREE_") || m === "RAZORPAY_BANK";
  })();
  const isElectronicallyVerified = isAppVerified || isDashboardElectronic;
  const hasProviderPayload = Object.keys(asRecord(summary.verifiedData ?? summary.verified_data)).length > 0;
  const status =
    doc.verified || isElectronicallyVerified
      ? ("verified" as const)
      : null;
  const verifiedAt =
    doc.verifiedAt != null
      ? typeof doc.verifiedAt === "string"
        ? doc.verifiedAt
        : doc.verifiedAt.toISOString()
      : null;

  const rows = pushRows(verifiedData, kind);
  // Only surface the auto-verify panel when there is real provider data or electronic verify.
  // Manual-upload leftovers (name only, no provider payload) must not look "auto verified".
  const hasSignal =
    (isElectronicallyVerified || hasProviderPayload) &&
    (rows.length > 0 ||
      !!status ||
      !!verifiedAt ||
      confidence != null ||
      !!doc.lastVerificationId ||
      !!doc.lastProviderReference ||
      (isElectronicallyVerified && !!method));

  if (!hasSignal) return null;

  return {
    method: isElectronicallyVerified || hasProviderPayload ? method : null,
    status,
    verifiedAt,
    verificationId: doc.lastVerificationId ?? null,
    providerReference: doc.lastProviderReference ?? null,
    confidence,
    rows,
  };
}
