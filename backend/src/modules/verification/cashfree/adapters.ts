/**
 * Cashfree response → NormalizedVerification adapters.
 *
 * One adapter per document kind. Each maps the Cashfree-specific keys we
 * captured live in Phase 2 §C to the unified `NormalizedVerification` shape.
 *
 * Rules the adapters follow:
 *   - Never guess. If the field isn't in the live sample, the adapter leaves
 *     it null.
 *   - Never expose Cashfree strings ("VALID", "INVALID") to consumers — every
 *     answer is normalised to §D vocab (`verified`, `rejected`, `pending`).
 *   - Photo / XML URLs go into `providerArtifacts` — the R2 mirror worker
 *     picks them up before Cashfree's 24h pre-signed TTL expires.
 *   - `verifiedData` is the promoted-column candidate list from Phase 2 §D.3.
 */
import type {
  NormalizedVerification,
  VerificationDocumentKind,
  VerificationSubjectKind,
  VerificationStatus,
} from "../types.js";
import type { ProviderCall } from "./provider.js";

type NormalizeCommonArgs = {
  verificationId: string;
  attemptNumber: number;
  subjectType: VerificationSubjectKind;
  subjectId: number;
  documentKind: VerificationDocumentKind;
};

/** Human-readable Cashfree reject reason for DL/RC (and similar VALID/INVALID products). */
export function cashfreeRejectReason(
  body: Record<string, unknown> | null | undefined,
  docLabel: string,
): string {
  const b = body && typeof body === "object" ? body : {};
  const status = String(b.status ?? b.rc_status ?? "").trim().toUpperCase();
  const message =
    typeof b.message === "string"
      ? b.message.trim()
      : typeof b.error === "string"
        ? b.error.trim()
        : "";
  const code =
    typeof b.code === "string"
      ? b.code.trim()
      : typeof b.error_code === "string"
        ? b.error_code.trim()
        : "";
  const parts: string[] = [];
  if (message) parts.push(message);
  if (status && status !== "VALID" && status !== "SUCCESS") {
    // Cashfree Try RC modal: "Vehicle RC Not Found" when INVALID / missing.
    if (
      (status === "INVALID" || status === "NOT_FOUND") &&
      /vehicle rc/i.test(docLabel) &&
      !message
    ) {
      parts.push("Vehicle RC does not exist");
    } else if (
      (status === "INVALID" || status === "NOT_FOUND") &&
      /driving/i.test(docLabel) &&
      !message
    ) {
      parts.push("Driving licence was not found or is invalid");
    } else {
      parts.push(`Cashfree status: ${status}`);
    }
  }
  if (code) parts.push(`Code: ${code}`);
  if (parts.length) return parts.join(" · ");
  return `${docLabel} was not verified by Cashfree (invalid number or not found).`;
}

function firstNonEmptyString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function unwrapCashfreeBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const o = body as Record<string, unknown>;
  const nested = o.data;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...o, ...(nested as Record<string, unknown>) };
  }
  return o;
}

/** Name as per ITD PAN — never `name_provided` (that is the name we sent). */
export function panHolderNameFromCashfreeBody(body: unknown): string | null {
  const b = unwrapCashfreeBody(body);
  const provided = firstNonEmptyString(b.name_provided);
  const maybeName = firstNonEmptyString(b.name);
  // Cashfree sometimes returns ITD name as `name` (not `registered_name`).
  // Only trust it when it differs from the name we sent for matching.
  const nameIfNotOurs =
    maybeName &&
    (!provided || maybeName.toUpperCase() !== provided.toUpperCase())
      ? maybeName
      : null;
  return firstNonEmptyString(
    b.registered_name,
    b.registered_nam,
    b.name_pan_card,
    b.name_on_pan,
    b.pan_name,
    b.full_name,
    b.pan_holder_name,
    nameIfNotOurs,
  );
}

/** Small helper — Cashfree pre-signed S3 URLs carry `X-Amz-Expires=86400`. */
function parseS3Expiry(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const dateStr = u.searchParams.get("X-Amz-Date"); // 20260705T021819Z
    const expires = u.searchParams.get("X-Amz-Expires");
    if (!dateStr || !expires) return null;
    // Convert 20260705T021819Z → 2026-07-05T02:18:19Z
    const iso = dateStr.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z");
    const t = new Date(iso).getTime() + Number(expires) * 1000;
    if (!Number.isFinite(t)) return null;
    return new Date(t).toISOString();
  } catch {
    return null;
  }
}

// ── PAN ────────────────────────────────────────────────────────────────────

export function adaptPan(call: ProviderCall<{
  pan?: string;
  type?: string;
  pan_type?: string;
  reference_id?: number | string;
  name_provided?: string | null;
  registered_name?: string | null;
  registered_nam?: string | null; // Cashfree typo in some docs/samples
  name_pan_card?: string | null;
  name_on_pan?: string | null;
  pan_name?: string | null;
  full_name?: string | null;
  father_name?: string | null;
  valid?: boolean;
  pan_status?: string | null;
  status?: string | null;
  aadhaar_seeding_status?: string | null;
  message?: unknown;
  name_match_score?: string | number | null;
  name_match_result?: string | null;
}>, args: NormalizeCommonArgs): NormalizedVerification {
  // Production sometimes returns an empty/non-object body on edge failures —
  // never throw here (that becomes a 500 after Cashfree already debited).
  const b = unwrapCashfreeBody(call.responseBody) as NonNullable<typeof call.responseBody> &
    Record<string, unknown>;

  const panStatus = String(b.pan_status ?? b.status ?? "").toUpperCase();
  const isValid =
    b.valid === true ||
    panStatus === "VALID" ||
    panStatus === "E"; // PAN Lite "exists" status
  const status: VerificationStatus = isValid ? "verified" : "rejected";

  // numeric(4,3) column — keep confidence in 0..1, never raw 0..100.
  let confidence: number | null = null;
  if (b.name_match_score != null && b.name_match_score !== "") {
    const raw = typeof b.name_match_score === "string"
      ? Number(b.name_match_score)
      : Number(b.name_match_score);
    if (Number.isFinite(raw)) {
      confidence = raw > 1 ? Math.min(1, raw / 100) : Math.max(0, Math.min(1, raw));
    }
  }

  const registered = panHolderNameFromCashfreeBody(b);
  const panType = firstNonEmptyString(b.type, b.pan_type);
  const statusReason =
    typeof b.message === "string" ? b.message
      : b.message == null ? null
        : String(b.message);

  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason,
    confidence,
    businessIdentifier: typeof b.pan === "string" ? b.pan : null,
    verifiedData: {
      pan: b.pan ?? null,
      type: panType,
      name_provided: b.name_provided ?? null,
      registered_name: registered,
      father_name: firstNonEmptyString(b.father_name),
      name_match_score: b.name_match_score ?? null,
      name_match_result: b.name_match_result ?? null,
      pan_status: b.pan_status ?? b.status ?? null,
      aadhaar_seeding_status: firstNonEmptyString(b.aadhaar_seeding_status),
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody ?? {},
    responseHeaders: call.responseHeaders ?? {},
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: [],
  };
}

// ── IFSC ──────────────────────────────────────────────────────────────────

export function adaptIfsc(call: ProviderCall<{
  verification_id?: string; reference_id?: number | string; status?: string;
  ifsc?: string; bank?: string; branch?: string; address?: string;
  city?: string; state?: string; ifsc_subcode?: string; category?: string; swift_code?: string;
  neft?: string; imps?: string; rtgs?: string; upi?: string; ft?: string; card?: string;
  micr?: number | string; nbin?: number | string;
}>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = call.responseBody;
  const status: VerificationStatus = b.status === "VALID" ? "verified" : "rejected";
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason: null,
    confidence: null,
    businessIdentifier: b.ifsc ?? null,
    verifiedData: {
      ifsc: b.ifsc, bank: b.bank, branch: b.branch,
      address: b.address, city: b.city, state: b.state,
      ifsc_subcode: b.ifsc_subcode, category: b.category, swift_code: b.swift_code,
      neft: b.neft, imps: b.imps, rtgs: b.rtgs, upi: b.upi, ft: b.ft, card: b.card,
      micr: b.micr, nbin: b.nbin,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: [],
  };
}

// ── DL ────────────────────────────────────────────────────────────────────

/** Format Cashfree cov_details → "LMV, MCWG" like Secure ID Try modal. */
function formatCovClasses(cov: unknown): string | null {
  if (cov == null) return null;
  if (typeof cov === "string") {
    const s = cov.trim();
    return s || null;
  }
  if (!Array.isArray(cov)) return null;
  const parts = cov
    .map((x) => {
      if (x == null) return "";
      if (typeof x === "string") return x.trim();
      if (typeof x === "object") {
        const r = x as Record<string, unknown>;
        return String(r.cov ?? r.class_of_vehicle ?? r.cov_details ?? "").trim();
      }
      return String(x).trim();
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function addressFromList(
  list: unknown,
  type: "permanent" | "temporary" | "present",
): string | null {
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const t = String(r.type ?? r.address_type ?? "").toLowerCase();
    if (!t.includes(type) && !(type === "temporary" && t.includes("present"))) continue;
    const addr = String(r.complete_address ?? r.address ?? "").trim();
    if (addr) return addr;
  }
  return null;
}

/**
 * Cashfree dl_validity object → human lines, e.g.
 * "Non-transport: 2023-06-23 → 2041-05-16"
 */
export function formatDlValidity(raw: unknown): string | null {
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

export function adaptDrivingLicence(call: ProviderCall<{
  verification_id?: string; reference_id?: number | string; status?: string;
  dl_number?: string | null; dob?: string | null;
  dl_validity?: unknown; badge_details?: unknown;
  details_of_driving_licence?: {
    name?: string | null;
    father_or_husband_name?: string | null;
    address?: string | null;
    address_list?: Array<{ complete_address?: string; type?: string; split_address?: unknown }>;
    split_address?: unknown;
    date_of_issue?: string | null;
    photo?: string | null;
    cov_details?: unknown;
  };
}>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = (call.responseBody && typeof call.responseBody === "object"
    ? call.responseBody
    : {}) as NonNullable<typeof call.responseBody>;
  const statusRaw = String(b.status ?? "").toUpperCase();
  const status: VerificationStatus = statusRaw === "VALID" ? "verified" : "rejected";
  const d = b.details_of_driving_licence ?? {};
  const photoUrl = d.photo ?? null;
  const classOfVehicle = formatCovClasses(d.cov_details);
  const permanentAddress =
    addressFromList(d.address_list, "permanent") ||
    (typeof d.address === "string" && d.address.trim() ? d.address.trim() : null);
  const temporaryAddress =
    addressFromList(d.address_list, "temporary") ||
    addressFromList(d.address_list, "present");
  const dlValiditySummary = formatDlValidity(b.dl_validity);
  const nonTransport =
    b.dl_validity && typeof b.dl_validity === "object" && !Array.isArray(b.dl_validity)
      ? (b.dl_validity as { non_transport?: { from?: string | null; to?: string | null } })
          .non_transport
      : null;
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason:
      status === "verified"
        ? null
        : cashfreeRejectReason(b as Record<string, unknown>, "Driving licence"),
    confidence: null,
    businessIdentifier: b.dl_number ?? null,
    verifiedData: {
      dl_number: b.dl_number,
      dob: b.dob,
      name: d.name,
      father_or_husband_name: d.father_or_husband_name,
      address: d.address,
      address_list: d.address_list,
      split_address: d.split_address,
      date_of_issue: d.date_of_issue,
      dl_validity: b.dl_validity,
      // Human-readable for rider DB / dashboard cards (not raw JSON).
      dl_validity_summary: dlValiditySummary,
      non_transport_from: nonTransport?.from ?? null,
      non_transport_to: nonTransport?.to ?? null,
      badge_details: b.badge_details,
      cov_details: d.cov_details,
      class_of_vehicle: classOfVehicle,
      permanent_address: permanentAddress,
      temporary_address: temporaryAddress,
      cashfree_status: b.status ?? null,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: photoUrl
      ? [{ kind: "photo", url: photoUrl, expiresAt: parseS3Expiry(photoUrl), contentType: "image/png" }]
      : [],
  };
}

// ── Vehicle RC ────────────────────────────────────────────────────────────

export function adaptVehicleRc(call: ProviderCall<Record<string, unknown>>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = (call.responseBody && typeof call.responseBody === "object"
    ? call.responseBody
    : {}) as Record<string, unknown>;
  const statusRaw = String(b.status ?? "").toUpperCase();
  const status: VerificationStatus = statusRaw === "VALID" ? "verified" : "rejected";
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason:
      status === "verified"
        ? null
        : cashfreeRejectReason(b, "Vehicle RC"),
    confidence: null,
    businessIdentifier: (b.reg_no as string) ?? null,
    verifiedData: {
      // Curated subset — full response is in raw archive.
      reg_no: b.reg_no,
      owner: b.owner,
      owner_father_name: b.owner_father_name,
      rc_status: b.rc_status,
      rc_expiry_date: b.rc_expiry_date,
      vehicle_class: b.class,
      vehicle_manufacturer_name: b.vehicle_manufacturer_name,
      model: b.model,
      vehicle_colour: b.vehicle_colour,
      fuel_type: b.type,
      body_type: b.body_type,
      reg_date: b.reg_date,
      vehicle_insurance_upto: b.vehicle_insurance_upto,
      vehicle_insurance_company_name: b.vehicle_insurance_company_name,
      rc_financer: b.rc_financer,
      permanent_address: b.permanent_address,
      split_permanent_address: b.split_permanent_address,
      present_address: b.present_address,
      split_present_address: b.split_present_address,
      is_commercial: b.is_commercial,
      vehicle_category: b.vehicle_category,
      vehicle_chasi_number: b.vehicle_chasi_number,
      vehicle_engine_number: b.vehicle_engine_number,
      fitness_upto: b.fitness_upto,
      puc_upto: b.puc_upto,
      maker_model: b.maker_model,
      cashfree_status: b.status ?? null,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: [],
  };
}

// ── Passport ──────────────────────────────────────────────────────────────

export function adaptPassport(call: ProviderCall<{
  verification_id?: string; reference_id?: number | string; status?: string;
  file_number?: string | null; name?: string | null; dob?: string | null;
  application_type?: string | null; application_received_date?: string | null;
}>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = call.responseBody;
  const status: VerificationStatus = b.status === "VALID" ? "verified" : "rejected";
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason: null,
    confidence: null,
    businessIdentifier: b.file_number ?? null,
    verifiedData: {
      file_number: b.file_number,
      name: b.name,
      dob: b.dob,
      application_type: b.application_type,
      application_received_date: b.application_received_date,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: [],
  };
}

// ── GSTIN ────────────────────────────────────────────────────────────────

export function adaptGstin(call: ProviderCall<{
  reference_id?: number | string;
  GSTIN?: string;
  legal_name_of_business?: string;
  trade_name_of_business?: string;
  gst_in_status?: string;
  taxpayer_type?: string;
  constitution_of_business?: string;
  date_of_registration?: string;
  center_jurisdiction?: string;
  state_jurisdiction?: string;
  last_update_date?: string;
  nature_of_business_activities?: string[];
  principal_place_address?: string;
  principal_place_split_address?: unknown;
  additional_address_array?: unknown;
}>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = call.responseBody;
  const status: VerificationStatus = b.gst_in_status === "Active" ? "verified" : "rejected";
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason: b.gst_in_status ?? null,
    confidence: null,
    businessIdentifier: b.GSTIN ?? null,
    verifiedData: {
      GSTIN: b.GSTIN,
      legal_name_of_business: b.legal_name_of_business,
      trade_name_of_business: b.trade_name_of_business,
      taxpayer_type: b.taxpayer_type,
      constitution_of_business: b.constitution_of_business,
      gst_in_status: b.gst_in_status,
      date_of_registration: b.date_of_registration,
      center_jurisdiction: b.center_jurisdiction,
      state_jurisdiction: b.state_jurisdiction,
      last_update_date: b.last_update_date,
      nature_of_business_activities: b.nature_of_business_activities,
      principal_place_address: b.principal_place_address,
      principal_place_split_address: b.principal_place_split_address,
      additional_address_array: b.additional_address_array,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: [],
  };
}

// ── CIN ──────────────────────────────────────────────────────────────────

export function adaptCin(call: ProviderCall<{
  verification_id?: string; reference_id?: number | string; status?: string;
  cin?: string; company_name?: string | null; registration_number?: number | null;
  incorporation_date?: string | null; cin_status?: string | null;
  email?: string | null; incorporation_country?: string | null;
  director_details?: Array<{ dob?: string; designation?: string; address?: string; din?: string; name?: string }>;
}>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = call.responseBody;
  const status: VerificationStatus = b.status === "VALID" ? "verified" : "rejected";
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason: null,
    confidence: null,
    businessIdentifier: b.cin ?? null,
    verifiedData: {
      cin: b.cin,
      company_name: b.company_name,
      registration_number: b.registration_number,
      incorporation_date: b.incorporation_date,
      cin_status: b.cin_status,
      email: b.email,
      incorporation_country: b.incorporation_country,
      director_details: b.director_details,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: [],
  };
}

// ── Bank Account (sync — for when Cashfree BAV sandbox is fixed) ─────────

export function adaptBankAccount(call: ProviderCall<{
  reference_id?: number | string;
  account_status?: string;
  account_status_code?: string;
  name_at_bank?: string | null;
  bank_name?: string | null;
  utr?: string | null;
  name_match_score?: string | number | null;
  name_match_result?: string | null;
  ifsc_details?: unknown;
}>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = call.responseBody;
  const status: VerificationStatus = b.account_status === "VALID" ? "verified" : "rejected";
  const score = typeof b.name_match_score === "string" ? Number(b.name_match_score) / 100 : (b.name_match_score ?? null);
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason: b.account_status_code ?? null,
    confidence: score != null && Number.isFinite(score) ? score : null,
    businessIdentifier: null, // bank account numbers stored last-4 in projection only
    verifiedData: {
      account_status: b.account_status,
      account_status_code: b.account_status_code,
      name_at_bank: b.name_at_bank,
      bank_name: b.bank_name ?? (b.ifsc_details && typeof b.ifsc_details === "object" && !Array.isArray(b.ifsc_details)
        ? String((b.ifsc_details as { bank?: string }).bank ?? "").trim() || null
        : null),
      branch_name: b.ifsc_details && typeof b.ifsc_details === "object" && !Array.isArray(b.ifsc_details)
        ? String(
            (b.ifsc_details as { branch?: string; branch_name?: string }).branch ??
              (b.ifsc_details as { branch_name?: string }).branch_name ??
              "",
          ).trim() || null
        : null,
      utr: b.utr,
      name_match_score: b.name_match_score,
      name_match_result: b.name_match_result,
      ifsc_details: b.ifsc_details,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: [],
  };
}

// ── Reverse Penny Drop — create step ─────────────────────────────────────

/**
 * RPD is multi-step: this adapter handles the CREATE response only. The final
 * result arrives via webhook (legacy body-embedded scheme) or by polling the
 * status endpoint. Status = provider_processing here, upgraded on webhook.
 */
export function adaptReversePennyDropCreate(call: ProviderCall<{
  verification_id?: string; ref_id?: number | string;
  valid_upto?: string; upi_link?: string; qr_code?: string;
  gpay?: string; bhim?: string; paytm?: string; phonepe?: string;
}>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = call.responseBody;
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.ref_id != null ? String(b.ref_id) : null,
    status: "provider_processing",
    statusReason: "rpd_link_generated",
    confidence: null,
    businessIdentifier: null,
    verifiedData: {
      valid_upto: b.valid_upto,
      upi_link: b.upi_link,
      qr_code: b.qr_code,
      gpay: b.gpay, bhim: b.bhim, paytm: b.paytm, phonepe: b.phonepe,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: [],
  };
}

// ── UPI Penny Drop (VPA verify) ───────────────────────────────────────────

export function adaptUpiPennyDrop(call: ProviderCall<{
  verification_id?: string;
  reference_id?: number | string;
  status?: string;
  account_status?: string;
  account_exists?: string;
  vpa?: string;
  name_at_bank?: string | null;
  customer_name?: string | null;
  ifsc?: string | null;
  utr?: string | null;
  bank_account?: string | null;
  ifsc_details?: { bank?: string; branch?: string } | null;
}>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = call.responseBody;
  const statusUp = String(b.status ?? "").toUpperCase();
  // /upi → account_exists YES/NO; /upi/penny-drop → status VALID/INVALID/SUCCESS
  const existsYes =
    String(b.account_exists ?? "").toUpperCase() === "YES" ||
    statusUp === "VALID" ||
    statusUp === "SUCCESS" ||
    String(b.account_status ?? "").toUpperCase() === "VALID";
  const existsNo =
    String(b.account_exists ?? "").toUpperCase() === "NO" ||
    statusUp === "INVALID" ||
    statusUp === "FAILED" ||
    statusUp === "EXPIRED";
  const ok = existsYes && !existsNo;
  const nameAtBank =
    (typeof b.name_at_bank === "string" && b.name_at_bank.trim()) ||
    (typeof b.customer_name === "string" && b.customer_name.trim()) ||
    null;
  const bankName =
    (typeof b.ifsc_details?.bank === "string" && b.ifsc_details.bank.trim()) ||
    null;
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status: ok ? "verified" : "rejected",
    statusReason: b.account_exists ?? b.status ?? b.account_status ?? null,
    confidence: null,
    businessIdentifier: b.vpa ?? null,
    verifiedData: {
      vpa: b.vpa,
      name_at_bank: nameAtBank,
      bank_name: bankName,
      ifsc: b.ifsc,
      bank_account: b.bank_account,
      utr: b.utr,
      account_status: b.account_exists ?? b.account_status ?? b.status,
      account_exists: b.account_exists,
      verification_path: call.path,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: [],
  };
}

// ── DigiLocker — create URL step ─────────────────────────────────────────

export function adaptDigilockerCreate(call: ProviderCall<{
  verification_id?: string; reference_id?: number | string;
  url?: string; status?: string;
  document_requested?: string[];
  user_flow?: string; redirect_url?: string;
}>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = call.responseBody;
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status: "provider_processing",
    statusReason: "digilocker_link_generated",
    confidence: null,
    businessIdentifier: null,
    verifiedData: {
      url: b.url,
      document_requested: b.document_requested,
      user_flow: b.user_flow,
      redirect_url: b.redirect_url,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: [],
  };
}

// ── Aadhaar Masking (same-page; no DigiLocker redirect) ───────────────────

export function adaptAadhaarMasking(
  call: ProviderCall<{
    status?: string;
    reference_id?: number | string;
    verification_id?: string;
    image_link?: string;
    message?: string;
  }>,
  args: NormalizeCommonArgs,
  extras?: {
    aadhaarNumber?: string;
    name?: string;
    dob?: string;
  },
): NormalizedVerification {
  const b =
    call.responseBody && typeof call.responseBody === "object"
      ? call.responseBody
      : ({} as NonNullable<typeof call.responseBody>);
  const statusRaw = String(b.status ?? "").toUpperCase();
  const isValid = statusRaw === "VALID" || statusRaw === "SUCCESS";
  const status: VerificationStatus = isValid ? "verified" : "rejected";

  // Inline mask to avoid circular imports at module top.
  const digits = String(extras?.aadhaarNumber || "").replace(/\D/g, "");
  const masked =
    digits.length >= 4 ? `XXXX-XXXX-${digits.slice(-4)}` : String(extras?.aadhaarNumber || "").trim();
  const name = String(extras?.name || "").trim();
  const dob = String(extras?.dob || "").trim();
  const imageLink = typeof b.image_link === "string" ? b.image_link : null;

  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason: isValid ? "aadhaar_masking_valid" : statusRaw || "aadhaar_masking_invalid",
    confidence: isValid ? 1 : 0,
    businessIdentifier: masked || null,
    verifiedData: {
      status: statusRaw || null,
      masked_aadhaar: masked || null,
      aadhaar_number: masked || null,
      uid: masked || null,
      name: name || null,
      holder_name: name || null,
      dob: dob || null,
      date_of_birth: dob || null,
      image_link: imageLink,
      verification_method: "cashfree_aadhaar_masking",
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
    httpStatus: call.status,
    durationMs: call.durationMs,
    providerArtifacts: imageLink
      ? [
          {
            kind: "photo",
            url: imageLink,
            expiresAt: parseS3Expiry(imageLink),
            contentType: "image/jpeg",
          },
        ]
      : [],
  };
}

