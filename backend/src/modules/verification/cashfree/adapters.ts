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
  reference_id?: number | string;
  name_provided?: string | null;
  registered_name?: string | null;
  father_name?: string | null;
  valid?: boolean;
  message?: string;
}>, args: NormalizeCommonArgs): NormalizedVerification {
  const b = call.responseBody;
  const status: VerificationStatus = b.valid === true ? "verified" : "rejected";
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason: b.message ?? null,
    confidence: null,
    businessIdentifier: b.pan ?? null,
    verifiedData: {
      pan: b.pan,
      type: b.type,
      name_provided: b.name_provided,
      registered_name: b.registered_name,
      father_name: b.father_name,
    },
    rawRequest: call.requestBody,
    rawResponse: call.responseBody,
    responseHeaders: call.responseHeaders,
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
  const b = call.responseBody;
  const status: VerificationStatus = b.status === "VALID" ? "verified" : "rejected";
  const d = b.details_of_driving_licence ?? {};
  const photoUrl = d.photo ?? null;
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason: null,
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
      badge_details: b.badge_details,
      cov_details: d.cov_details,
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
  const b = call.responseBody as Record<string, unknown>;
  const status: VerificationStatus = b.status === "VALID" ? "verified" : "rejected";
  return {
    ...args,
    provider: "cashfree",
    providerReference: b.reference_id != null ? String(b.reference_id) : null,
    status,
    statusReason: null,
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
      bank_name: b.bank_name,
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
