/**
 * Verification orchestration service.
 *
 * One entry per document kind. Each entry:
 *
 *   1. Consults the policy engine — if mode='manual' or 'disabled', returns
 *      immediately (the caller then routes through the existing manual flow).
 *   2. Mints a verification_id and inserts a verification_requests row.
 *   3. Calls the Cashfree provider layer.
 *   4. Normalises the response via the adapter.
 *   5. Writes archival rows + updates the request outcome.
 *   6. Optionally queues manual review if confidence < threshold.
 *
 * Errors from the provider layer are categorised (CashfreeError) and, where
 * safe, retried once with a new verification_id. Terminal failures set
 * status='failed'|'timeout'|'provider_down' and — if policy.fallback_to_manual
 * is true — the caller is expected to fall back to manual upload.
 */
import { loadCashfreeConfig } from "./cashfree/config.js";
import { cashfree } from "./cashfree/provider.js";
import {
  adaptBankAccount,
  adaptCin,
  adaptDigilockerCreate,
  adaptAadhaarMasking,
  adaptDrivingLicence,
  adaptGstin,
  adaptIfsc,
  adaptPan,
  adaptPassport,
  adaptReversePennyDropCreate,
  adaptUpiPennyDrop,
  adaptVehicleRc,
} from "./cashfree/adapters.js";
import { CashfreeError, isRetryableCategory } from "./cashfree/errors.js";
import {
  createRequest,
  newVerificationId,
  persistOutcome,
  appendEvent,
  applyAsyncTerminalOutcome,
} from "./history.js";
import { resolveEffectivePolicy } from "./policy/engine.js";
import type {
  NormalizedVerification,
  VerificationDocumentKind,
  VerificationSubjectKind,
  EffectivePolicy,
  VerificationStatus,
} from "./types.js";
import { getSql } from "../../db/client.js";
import { RIDER_DIGILOCKER_HTTPS_RETURN } from "../../lib/rider-digilocker-return-html.js";

export type SubmitCommonArgs = {
  subjectType: VerificationSubjectKind;
  subjectId: number;
  riderDocumentId?: number | null;
  merchantDocumentId?: number | null;
  createdBy?: number | null;
  subjectFacts?: Record<string, unknown>;
  /**
   * Agent dashboard electronic verify: persist provider audit trail but do NOT
   * flip rider/merchant document rows to verified until an agent explicitly approves.
   */
  deferProjection?: boolean;
};

export type SubmitOutcome =
  | { kind: "auto"; result: NormalizedVerification; requestId: number; policy: EffectivePolicy }
  | { kind: "manual"; reason: string; policy: EffectivePolicy; detail?: string };

/** Every per-doc-kind method below wraps `runProviderCall` with the right adapter. */
type ProviderCallFn = (verificationId: string, cfg: { timeoutMs: number }) => Promise<{
  raw: Parameters<typeof adaptPan>[0]; // typed loosely — each caller narrows
  normalized: NormalizedVerification;
}>;

async function runProviderCall(
  docKind: VerificationDocumentKind,
  args: SubmitCommonArgs,
  provider: (verificationId: string) => Promise<NormalizedVerification>,
): Promise<SubmitOutcome> {
  // 1. Policy
  const policy = await resolveEffectivePolicy({
    subjectType: args.subjectType,
    documentKind: docKind,
    subjectFacts: args.subjectFacts,
  });
  if (policy.mode === "manual" || policy.mode === "disabled") {
    return { kind: "manual", reason: `policy_mode_${policy.mode}`, policy };
  }

  // 2. Resolve provider config for archival provenance.
  let providerConfigId: number | null = null;
  try {
    const cfg = await loadCashfreeConfig();
    providerConfigId = cfg.configId;
  } catch {
    // No active provider config — treat as manual.
    return { kind: "manual", reason: "provider_not_configured", policy };
  }

  // 3. Mint verification_id, create request row.
  const verificationId = newVerificationId();
  const requestId = await createRequest({
    verificationId,
    provider: "cashfree",
    providerConfigId,
    documentKind: docKind,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    riderDocumentId: args.riderDocumentId ?? null,
    merchantDocumentId: args.merchantDocumentId ?? null,
    policySnapshotId: policy.policySnapshotId || null,
    attemptNumber: 1,
    createdBy: args.createdBy ?? null,
  });
  await appendEvent({
    requestId, eventKind: "submit", toStatus: "initiated", actorType: "system",
    details: { policyId: policy.policyId, mode: policy.mode },
  });

  // 4. Call provider, adapt, persist.
  try {
    const normalized = await provider(verificationId);

    // Cashfree may already have debited — never turn a post-provider DB glitch
    // into a 500 that blocks the merchant UI.
    try {
      await persistOutcome(requestId, normalized, {
        deferProjection: !!args.deferProjection,
      });
    } catch (persistErr) {
      console.error(
        "[verification] persistOutcome failed after provider success:",
        persistErr instanceof Error ? persistErr.message : persistErr,
        persistErr instanceof Error ? persistErr.stack : "",
      );
    }

    // 5. Auto-approve gating.
    try {
      if (
        normalized.status === "verified" &&
        policy.confidenceThreshold != null &&
        normalized.confidence != null &&
        normalized.confidence < policy.confidenceThreshold
      ) {
        await appendEvent({
          requestId, eventKind: "manual_review_queued",
          fromStatus: "verified", toStatus: "manual_review", actorType: "system",
          details: { reason: "confidence_below_threshold", threshold: policy.confidenceThreshold, actual: normalized.confidence },
        });
        normalized.status = "manual_review";
      }
      if (normalized.status === "verified" && !policy.autoApprove) {
        await appendEvent({
          requestId, eventKind: "manual_review_queued",
          fromStatus: "verified", toStatus: "manual_review", actorType: "system",
          details: { reason: "policy_requires_review" },
        });
        normalized.status = "manual_review";
      }
    } catch (gateErr) {
      console.error(
        "[verification] auto-approve gating failed:",
        gateErr instanceof Error ? gateErr.message : gateErr,
      );
    }

    return { kind: "auto", result: normalized, requestId, policy };
  } catch (e) {
    if (e instanceof CashfreeError) {
      const status =
        e.category === "timeout" ? "timeout" :
        e.category === "provider_down" ? "provider_down" :
        e.category === "duplicate" ? "duplicate" :
        e.category === "upstream_failed" ? "rejected" :
        "failed";
      try {
        await appendEvent({
          requestId,
          eventKind: "provider_response",
          fromStatus: "initiated",
          toStatus: status,
          actorType: "provider",
          details: { category: e.category, code: e.cfCode, message: e.message },
        });
        await persistOutcome(requestId, {
          verificationId, attemptNumber: 1, provider: "cashfree",
          providerReference: null, subjectType: args.subjectType, subjectId: args.subjectId,
          documentKind: docKind, status,
          statusReason: `${e.category}: ${e.message}`, confidence: null, businessIdentifier: null,
          verifiedData: {}, rawRequest: {}, rawResponse: e.body ?? { error: e.message },
          responseHeaders: {}, httpStatus: e.status ?? null, durationMs: null, providerArtifacts: [],
        }, { deferProjection: !!args.deferProjection });
      } catch (persistErr) {
        console.error(
          "[verification] failed to archive CashfreeError outcome:",
          persistErr instanceof Error ? persistErr.message : persistErr,
        );
      }

      // Fallback-to-manual: caller keeps the projection untouched and lets the
      // agent finish the doc through the existing manual workflow.
      if (policy.fallbackToManual && isRetryableCategory(e.category) === false) {
        return { kind: "manual", reason: `provider_error_${e.category}`, policy, detail: e.message };
      }
      return { kind: "manual", reason: `provider_error_${e.category}`, policy, detail: e.message };
    }
    console.error(
      "[verification] unexpected submit error:",
      e instanceof Error ? e.message : e,
      e instanceof Error ? e.stack : "",
    );
    throw e;
  }
}

// ── Per-document submit methods ────────────────────────────────────────────

export async function submitPan(args: SubmitCommonArgs & { pan: string; name?: string }): Promise<SubmitOutcome> {
  return runProviderCall("pan", args, async (vid) => {
    const name = typeof args.name === "string" ? args.name.trim() : "";
    const call = await cashfree.verifyPan({
      verification_id: vid,
      pan: args.pan,
      ...(name ? { name } : {}),
    });
    return adaptPan(call as never, common("pan", vid, args));
  });
}

export async function submitIfsc(args: SubmitCommonArgs & { ifsc: string }): Promise<SubmitOutcome> {
  return runProviderCall("ifsc", args, async (vid) => {
    const call = await cashfree.verifyIfsc({ verification_id: vid, ifsc: args.ifsc });
    return adaptIfsc(call as never, common("ifsc", vid, args));
  });
}

export async function submitDrivingLicence(args: SubmitCommonArgs & { dlNumber: string; dob: string }): Promise<SubmitOutcome> {
  return runProviderCall("driving_licence", args, async (vid) => {
    const call = await cashfree.verifyDrivingLicence({ verification_id: vid, dl_number: args.dlNumber, dob: args.dob });
    return adaptDrivingLicence(call as never, common("driving_licence", vid, args));
  });
}

export async function submitVehicleRc(args: SubmitCommonArgs & { vehicleNumber: string }): Promise<SubmitOutcome> {
  return runProviderCall("vehicle_rc", args, async (vid) => {
    const call = await cashfree.verifyVehicleRc({ verification_id: vid, vehicle_number: args.vehicleNumber });
    return adaptVehicleRc(call as never, common("vehicle_rc", vid, args));
  });
}

export async function submitPassport(args: SubmitCommonArgs & { fileNumber: string; dob: string; name?: string }): Promise<SubmitOutcome> {
  return runProviderCall("passport", args, async (vid) => {
    const call = await cashfree.verifyPassport({ verification_id: vid, file_number: args.fileNumber, dob: args.dob, name: args.name });
    return adaptPassport(call as never, common("passport", vid, args));
  });
}

export async function submitGstin(args: SubmitCommonArgs & { gstin: string; businessName?: string }): Promise<SubmitOutcome> {
  return runProviderCall("gstin", args, async (vid) => {
    const call = await cashfree.verifyGstin({ GSTIN: args.gstin, business_name: args.businessName });
    return adaptGstin(call as never, common("gstin", vid, args));
  });
}

export async function submitCin(args: SubmitCommonArgs & { cin: string }): Promise<SubmitOutcome> {
  return runProviderCall("cin", args, async (vid) => {
    const call = await cashfree.verifyCin({ verification_id: vid, cin: args.cin });
    return adaptCin(call as never, common("cin", vid, args));
  });
}

export async function submitBankAccount(args: SubmitCommonArgs & { bankAccount: string; ifsc: string; name?: string; phone?: string }): Promise<SubmitOutcome> {
  return runProviderCall("bank_account", args, async (vid) => {
    const call = await cashfree.verifyBankAccountSync({ verification_id: vid, bank_account: args.bankAccount, ifsc: args.ifsc, name: args.name, phone: args.phone });
    return adaptBankAccount(call as never, common("bank_account", vid, args));
  });
}

export async function submitUpiPennyDrop(args: SubmitCommonArgs & { vpa: string; name?: string }): Promise<SubmitOutcome> {
  return runProviderCall("upi_penny_drop", args, async (vid) => {
    const call = await cashfree.verifyUpiPennyDrop({
      verification_id: vid,
      vpa: args.vpa.trim().toLowerCase(),
      name: args.name,
    });
    return adaptUpiPennyDrop(call as never, common("upi_penny_drop", vid, args));
  });
}

export async function submitReversePennyDrop(args: SubmitCommonArgs & { redirectUrl?: string; name?: string }): Promise<SubmitOutcome> {
  return runProviderCall("reverse_penny_drop", args, async (vid) => {
    const call = await cashfree.createReversePennyDrop({
      verification_id: vid,
      name: args.name,
      redirect_url: ensureCashfreeHttpsRedirectUrl(args.redirectUrl),
    });
    return adaptReversePennyDropCreate(call as never, common("reverse_penny_drop", vid, args));
  });
}

export async function submitDigilocker(args: SubmitCommonArgs & {
  documents: Array<"AADHAAR" | "PAN" | "DRIVING_LICENSE">;
  redirectUrl?: string;
  userFlow?: "signin" | "signup";
}): Promise<SubmitOutcome> {
  return runProviderCall("aadhaar_digilocker", args, async (vid) => {
    // Riders must never inherit merchant CASHFREE_DIGILOCKER_REDIRECT_URL (partner portal 404).
    const redirect_url =
      args.subjectType === "rider"
        ? resolveRiderDigilockerRedirectUrl(args.redirectUrl)
        : ensureCashfreeHttpsRedirectUrl(args.redirectUrl);
    const call = await cashfree.createDigilocker({
      verification_id: vid,
      document_requested: args.documents,
      redirect_url,
      user_flow: args.userFlow ?? "signin",
    });
    return adaptDigilockerCreate(call as never, common("aadhaar_digilocker", vid, args));
  });
}

/**
 * Rider Aadhaar same-page verify via Cashfree Aadhaar Masking (no DigiLocker browser).
 * Uses the existing `aadhaar_digilocker` policy row so ops mode (auto/hybrid) still applies.
 */
export async function submitAadhaarMasking(args: SubmitCommonArgs & {
  imageKey: string;
  aadhaarNumber?: string;
  name?: string;
  dob?: string;
}): Promise<SubmitOutcome> {
  return runProviderCall("aadhaar_digilocker", args, async (vid) => {
    const { getObjectByKey } = await import("../../services/r2/r2Service.js");
    const obj = await getObjectByKey(args.imageKey);
    if (!obj?.buffer?.length) {
      throw new CashfreeError("invalid_input", "aadhaar_image_not_found");
    }
    const call = await cashfree.maskAadhaar({
      verification_id: vid,
      image: obj.buffer,
      contentType: obj.contentType || "image/jpeg",
      filename: "aadhaar.jpg",
    });
    return adaptAadhaarMasking(call as never, common("aadhaar_digilocker", vid, args), {
      aadhaarNumber: args.aadhaarNumber,
      name: args.name,
      dob: args.dob,
    });
  });
}

/** Cashfree DigiLocker / RPD require redirect_url to start with https://. */
function ensureCashfreeHttpsRedirectUrl(url?: string | null): string {
  const envFallback = String(
    process.env.CASHFREE_DIGILOCKER_REDIRECT_URL ||
      process.env.VERIFICATION_PUBLIC_REDIRECT_URL ||
      process.env.PUBLIC_APP_HTTPS_URL ||
      "",
  ).trim();
  const candidates = [String(url || "").trim(), envFallback].filter(Boolean);
  for (const raw of candidates) {
    try {
      const u = new URL(raw);
      if (u.protocol === "http:") u.protocol = "https:";
      if (u.protocol === "https:") return u.toString();
    } catch {
      /* next */
    }
  }
  // Merchant/partner default — never send riders here (rider onboarding passes its own URL).
  return "https://partner.gatimitra.com/auth/digilocker-return";
}

/** HTTPS return URL for Rider app DigiLocker (Custom Tab dismisses on this URL). */
export function resolveRiderDigilockerRedirectUrl(requested?: string | null): string {
  for (const raw of [
    String(requested || "").trim(),
    String(process.env.CASHFREE_RIDER_DIGILOCKER_REDIRECT_URL || "").trim(),
  ]) {
    if (!raw) continue;
    try {
      const u = new URL(raw);
      if (u.protocol === "http:") u.protocol = "https:";
      // Never payment checkout, never partner portal.
      if (u.protocol !== "https:") continue;
      if (/partner\.gatimitra\.com/i.test(u.hostname)) continue;
      if (/\/v1\/razorpay-checkout/i.test(u.pathname)) continue;
      return u.toString();
    } catch {
      /* next */
    }
  }

  const apiBase = String(process.env.API_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  if (apiBase.startsWith("https://")) {
    return `${apiBase}/v1/onboarding/digilocker-return`;
  }

  return RIDER_DIGILOCKER_HTTPS_RETURN;
}

/** Soft lookup for DigiLocker HTTPS return page (never throws to the browser). */
export async function lookupDigilockerReturnByVerificationId(
  verificationId: string,
): Promise<{ known: boolean; status?: string; subjectType?: string; documentKind?: string }> {
  const id = String(verificationId || "").trim();
  if (!id) return { known: false };
  try {
    const sql = getSql();
    const rows = (await sql`
      SELECT status::text AS status, subject_type, document_kind
        FROM public.verification_requests
       WHERE verification_id = ${id}
       LIMIT 1
    `) as unknown as Array<{
      status: string;
      subject_type: string;
      document_kind: string;
    }>;
    if (!rows[0]) return { known: false };
    return {
      known: true,
      status: String(rows[0].status || "").toLowerCase(),
      subjectType: String(rows[0].subject_type || ""),
      documentKind: String(rows[0].document_kind || ""),
    };
  } catch {
    return { known: false };
  }
}

export type DigilockerPollResult = {
  status: string;
  verified: boolean;
  verifiedData?: Record<string, unknown>;
  statusReason?: string | null;
  verificationId?: string | null;
};

/**
 * Active DigiLocker completion for onboarding UIs.
 * Cashfree stays PENDING until the user finishes consent; once AUTHENTICATED we
 * fetch the Aadhaar document and mark the request verified. This does not rely
 * on webhooks (critical for local/dev where Cashfree cannot reach localhost).
 */
export async function pollDigilockerForSubject(args: {
  subjectType: VerificationSubjectKind;
  subjectId: number;
}): Promise<DigilockerPollResult> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, verification_id, provider_reference, status::text AS status
      FROM public.verification_requests
     WHERE subject_type = ${args.subjectType}
       AND subject_id = ${args.subjectId}
       AND document_kind = 'aadhaar_digilocker'
     ORDER BY created_at DESC
     LIMIT 1
  `) as unknown as Array<{
    id: number;
    verification_id: string;
    provider_reference: string | null;
    status: string;
  }>;

  if (!rows[0]) {
    return { status: "none", verified: false };
  }

  const row = rows[0];
  const current = String(row.status || "").toLowerCase();

  if (current === "verified") {
    const ev = (await sql`
      SELECT details FROM public.verification_events
       WHERE request_id = ${row.id}
       ORDER BY created_at DESC
       LIMIT 8
    `) as unknown as Array<{ details: unknown }>;
    let verifiedData: Record<string, unknown> | undefined;
    for (const e of ev) {
      const d = (e.details as { verifiedData?: Record<string, unknown> } | null)?.verifiedData;
      if (d && typeof d === "object") {
        verifiedData = d;
        break;
      }
    }
    return {
      status: "verified",
      verified: true,
      verifiedData,
      verificationId: row.verification_id,
    };
  }

  if (
    current === "failed" ||
    current === "rejected" ||
    current === "expired" ||
    current === "consent_denied"
  ) {
    return {
      status: current,
      verified: false,
      verificationId: row.verification_id,
    };
  }

  let statusBody: {
    status?: string;
    user_details?: Record<string, unknown>;
    reference_id?: number | string;
    document_consent?: string[];
  };
  try {
    const call = await cashfree.getDigilockerStatus(row.verification_id);
    statusBody = (call.responseBody || {}) as typeof statusBody;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "status_poll_failed";
    return {
      status: "provider_processing",
      verified: false,
      statusReason: msg,
      verificationId: row.verification_id,
    };
  }

  const cfStatus = String(statusBody.status || "").toUpperCase();
  const providerRef =
    statusBody.reference_id != null
      ? String(statusBody.reference_id)
      : row.provider_reference;

  if (cfStatus === "PENDING" || !cfStatus) {
    return {
      status: "provider_processing",
      verified: false,
      statusReason: "pending_consent",
      verificationId: row.verification_id,
    };
  }

  if (cfStatus === "EXPIRED" || cfStatus === "CONSENT_DENIED") {
    const terminalStatus: VerificationStatus =
      cfStatus === "EXPIRED" ? "expired" : "consent_denied";
    const outcome: NormalizedVerification = {
      verificationId: row.verification_id,
      attemptNumber: 1,
      subjectType: args.subjectType,
      subjectId: args.subjectId,
      documentKind: "aadhaar_digilocker",
      provider: "cashfree",
      providerReference: providerRef,
      status: terminalStatus,
      statusReason: `cashfree:${cfStatus.toLowerCase()}`,
      confidence: null,
      businessIdentifier: null,
      verifiedData: {},
      rawRequest: null,
      rawResponse: statusBody,
      responseHeaders: {},
      httpStatus: 200,
      durationMs: null,
      providerArtifacts: [],
    };
    await applyAsyncTerminalOutcome(row.id, current as VerificationStatus, outcome);
    return {
      status: terminalStatus,
      verified: false,
      statusReason: outcome.statusReason,
      verificationId: row.verification_id,
    };
  }

  if (cfStatus !== "AUTHENTICATED") {
    return {
      status: "provider_processing",
      verified: false,
      statusReason: `cashfree:${cfStatus.toLowerCase()}`,
      verificationId: row.verification_id,
    };
  }

  let documentBody: Record<string, unknown> = {};
  try {
    const docCall = await cashfree.getDigilockerDocument("AADHAAR", row.verification_id);
    documentBody = (docCall.responseBody || {}) as Record<string, unknown>;
  } catch {
    // Status AUTHENTICATED already proves consent; fall back to user_details.
  }

  const userDetails =
    statusBody.user_details && typeof statusBody.user_details === "object"
      ? statusBody.user_details
      : {};
  const verifiedData: Record<string, unknown> = {
    ...userDetails,
    ...(documentBody && typeof documentBody === "object" ? documentBody : {}),
    digilocker_status: cfStatus,
    document_consent: statusBody.document_consent ?? null,
  };

  const { maskAadhaarNumber, normalizeAadhaarVerifiedDetails } = await import("../../lib/mask-aadhaar.js");
  const normalized = normalizeAadhaarVerifiedDetails(verifiedData);
  // Never persist full Aadhaar UID in verified payloads / business identifier.
  if (normalized.maskedAadhaar) {
    verifiedData.uid = normalized.maskedAadhaar;
    verifiedData.aadhaar_number = normalized.maskedAadhaar;
    verifiedData.masked_aadhaar = normalized.maskedAadhaar;
  }
  if (normalized.name && !verifiedData.name) {
    verifiedData.name = normalized.name;
  }

  const aadhaarUid = normalized.maskedAadhaar || maskAadhaarNumber(
    String(
      verifiedData.uid ||
        verifiedData.aadhaar_number ||
        verifiedData.masked_aadhaar ||
        "",
    ).trim(),
  );

  const outcome: NormalizedVerification = {
    verificationId: row.verification_id,
    attemptNumber: 1,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    documentKind: "aadhaar_digilocker",
    provider: "cashfree",
    providerReference: providerRef,
    status: "verified",
    statusReason: "digilocker_authenticated",
    confidence: 0.99,
    businessIdentifier: aadhaarUid || null,
    verifiedData,
    rawRequest: null,
    rawResponse: { status: statusBody, document: documentBody },
    responseHeaders: {},
    httpStatus: 200,
    durationMs: null,
    providerArtifacts: [],
  };

  await applyAsyncTerminalOutcome(row.id, current as VerificationStatus, outcome);

  return {
    status: "verified",
    verified: true,
    verifiedData,
    statusReason: outcome.statusReason,
    verificationId: row.verification_id,
  };
}

function common(kind: VerificationDocumentKind, vid: string, args: SubmitCommonArgs) {
  return {
    verificationId: vid,
    attemptNumber: 1,
    subjectType: args.subjectType,
    subjectId: args.subjectId,
    documentKind: kind,
  };
}
